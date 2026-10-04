import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { sellableBatchWhere } from '../utils/hubStock';

export class HubService {
  /**
   * Get hub centers
   */
  async getHubCenters(filters: { city?: string }) {
    const where: any = {
      status: 'active',
    };

    if (filters.city) {
      where.city = filters.city;
    }

    const hubs = await prisma.hubCenter.findMany({
      where,
      include: {
        inventory: {
          // Only stock a customer could actually buy: not quarantined, expired or
          // about to expire, and for a product that is live on the catalog.
          where: {
            ...sellableBatchWhere(),
            product: { approvalStatus: 'approved', isActive: true },
          },
          select: { productId: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return hubs.map((hub) => ({
      id: hub.id,
      name: hub.name,
      code: hub.code,
      city: hub.city,
      area: hub.area,
      address: hub.address,
      coordinates: hub.latitude && hub.longitude
        ? {
            latitude: Number(hub.latitude),
            longitude: Number(hub.longitude),
          }
        : null,
      operatingHours: hub.operatingHours as any,
      status: hub.status,
      availableProductsCount: new Set(hub.inventory.map((i) => i.productId)).size,
    }));
  }

  /**
   * Get hub inventory
   */
  async getHubInventory(
    hubId: string,
    filters: {
      categoryId?: string;
      search?: string;
    }
  ) {
    const hub = await prisma.hubCenter.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');
    }

    // Public endpoint: show only what can be bought. It used to list quarantined,
    // damaged and expired batches, and products that were unapproved or inactive.
    const where: any = {
      hubId,
      ...sellableBatchWhere(),
      product: { approvalStatus: 'approved', isActive: true, seller: { status: 'active' } },
    };

    if (filters.categoryId) {
      where.product = {
        ...where.product,
        categoryId: filters.categoryId,
      };
    }

    if (filters.search) {
      where.product = {
        ...where.product,
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { nameUrdu: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    const inventory = await prisma.hubInventory.findMany({
      where,
      include: {
        product: {
          include: {
            seller: {
              select: {
                id: true,
                businessName: true,
                isVerified: true,
              },
            },
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      hub: {
        id: hub.id,
        name: hub.name,
        code: hub.code,
        city: hub.city,
        area: hub.area,
        address: hub.address,
      },
      inventory: inventory.map((item) => ({
        product: {
          id: item.product.id,
          name: item.product.name,
          nameUrdu: item.product.nameUrdu,
          price: Number(item.product.price),
          image: item.product.images[0]?.imageUrl || null,
          seller: {
            id: item.product.seller.id,
            businessName: item.product.seller.businessName,
            isVerified: item.product.seller.isVerified,
          },
        },
        quantity: item.quantity,
        expiryDate: item.expiryDate,
        batchNumber: item.batchNumber,
      })),
    };
  }

  /**
   * Record batch intake at hub with mandatory <= -18°C temperature verification.
   * If measured temperature exceeds -18°C, the batch is automatically quarantined.
   *
   * Everything happens in one transaction under a lock on the batch number, so two
   * simultaneous intakes of the same batch can't collide or lose quantity. Rules:
   *  - quantity must be a positive whole number (a negative one used to *remove* stock);
   *  - the seller is taken from the product — a client-supplied sellerId is only
   *    accepted if it matches;
   *  - a new delivery never changes the status of stock already on the shelf: it can't
   *    release a quarantined batch, and a delivery that FAILS the cold-chain check
   *    can't be merged into (and so quarantine) good stock — it needs its own batch number;
   *  - when merging, the earliest expiry wins (the conservative choice).
   */
  async recordBatchIntake(data: {
    hubId: string;
    productId: string;
    sellerId?: string;
    quantity: number;
    batchNumber: string;
    manufacturedDate?: string | Date;
    expiryDate: string | Date;
    measuredTemperatureCelsius: number;
    storageUnit?: string;
    barcode?: string;
    staffUserId?: string;
  }) {
    const quantity = Number(data.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
      throw new AppError('Quantity must be a positive whole number', 400, 'INVALID_QUANTITY');
    }
    const batchNumber = String(data.batchNumber ?? '').trim();
    if (!batchNumber || batchNumber.length > 100) {
      throw new AppError('A batch number is required', 400, 'INVALID_BATCH_NUMBER');
    }
    const temperature = Number(data.measuredTemperatureCelsius);
    if (!Number.isFinite(temperature) || temperature < -100 || temperature > 100) {
      throw new AppError('A valid measured temperature is required', 400, 'INVALID_TEMPERATURE');
    }
    const expiryDate = new Date(data.expiryDate);
    if (Number.isNaN(expiryDate.getTime())) {
      throw new AppError('A valid expiry date is required', 400, 'INVALID_EXPIRY');
    }
    if (expiryDate.getTime() <= Date.now()) {
      throw new AppError('This batch has already expired and cannot be received', 400, 'BATCH_EXPIRED');
    }
    const manufacturedDate = data.manufacturedDate ? new Date(data.manufacturedDate) : undefined;
    if (manufacturedDate && (Number.isNaN(manufacturedDate.getTime()) || manufacturedDate.getTime() > Date.now() + 24 * 3600 * 1000)) {
      throw new AppError('Invalid manufactured date', 400, 'INVALID_MANUFACTURED_DATE');
    }

    const hub = await prisma.hubCenter.findUnique({ where: { id: data.hubId } });
    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');
    if (hub.status !== 'active') throw new AppError('This hub is not active', 400, 'HUB_INACTIVE');

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    if (data.sellerId && data.sellerId !== product.sellerId) {
      throw new AppError('That seller does not own this product', 400, 'SELLER_MISMATCH');
    }
    const sellerId = product.sellerId;

    const tempBreach = temperature > -18.0;
    const storageUnit = data.storageUnit || undefined;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${data.hubId}:${data.productId}:${batchNumber}`}))`;

      const existingBatch = await tx.hubInventory.findUnique({
        where: {
          hubId_productId_batchNumber: { hubId: data.hubId, productId: data.productId, batchNumber },
        },
      });
      if (existingBatch) {
        // Row lock + fresh read: an order allocating from this batch at the same moment
        // must not have its decrement overwritten by a stale quantity.
        await tx.$queryRaw`SELECT id FROM hub_inventory WHERE id = ${existingBatch.id} FOR UPDATE`;
      }
      const lockedBatch = existingBatch
        ? await tx.hubInventory.findUniqueOrThrow({ where: { id: existingBatch.id } })
        : null;

      let batch;
      let previousQuantity = 0;
      let newQuantity = quantity;
      let batchStatus: string = tempBreach ? 'damaged' : 'available';
      let note = '';

      if (lockedBatch) {
        if (lockedBatch.status === 'expired' || lockedBatch.expiryDate.getTime() <= Date.now()) {
          throw new AppError(
            `Batch ${batchNumber} has expired; receive new stock under a new batch number`,
            409,
            'BATCH_EXPIRED'
          );
        }
        if (tempBreach) {
          throw new AppError(
            `Batch ${batchNumber} already exists. A delivery that failed the cold-chain check must be logged under a new batch number so it cannot quarantine the stock already on the shelf.`,
            409,
            'BATCH_EXISTS'
          );
        }
        previousQuantity = lockedBatch.quantity;
        newQuantity = lockedBatch.quantity + quantity;
        const wasDepleted = lockedBatch.quantity === 0;
        // A good delivery never releases a quarantined batch; that takes an explicit release.
        // A manual hold ('reserved' with stock on it) survives a delivery; only a
        // depleted batch is reopened.
        batchStatus =
          lockedBatch.status === 'damaged' ? 'damaged'
          : lockedBatch.status === 'reserved' && !wasDepleted ? 'reserved'
          : 'available';
        if (lockedBatch.status === 'damaged') {
          note = ' The batch stays quarantined until it is explicitly released.';
        }
        batch = await tx.hubInventory.update({
          where: { id: lockedBatch.id },
          data: {
            quantity: { increment: quantity },
            expiryDate: expiryDate < lockedBatch.expiryDate ? expiryDate : lockedBatch.expiryDate,
            manufacturedDate: manufacturedDate ?? lockedBatch.manufacturedDate,
            storageUnit: storageUnit || lockedBatch.storageUnit || 'FREEZER-01',
            barcode: data.barcode || lockedBatch.barcode,
            status: batchStatus,
          },
        });
      } else {
        batch = await tx.hubInventory.create({
          data: {
            hubId: data.hubId,
            productId: data.productId,
            sellerId,
            quantity,
            batchNumber,
            manufacturedDate,
            expiryDate,
            storageUnit: storageUnit || 'FREEZER-01',
            barcode: data.barcode,
            status: batchStatus,
          },
        });
      }

      // Record temperature log
      await tx.hubTemperatureLog.create({
        data: {
          hubId: data.hubId,
          temperatureCelsius: temperature,
          freezerUnit: data.storageUnit ? parseInt(data.storageUnit.replace(/\D/g, '')) || 1 : 1,
          isAlert: tempBreach,
        },
      });

      // Update hub current temperature reading
      await tx.hubCenter.update({
        where: { id: data.hubId },
        data: { temperatureCelsius: temperature },
      });

      // Record intake audit log
      await tx.hubInventoryLog.create({
        data: {
          hubInventoryId: batch.id,
          action: tempBreach ? 'expired' : 'stock_in',
          quantityChange: quantity,
          previousQuantity,
          newQuantity,
          reason: tempBreach
            ? `COLD CHAIN VIOLATION: Batch intake measured at ${temperature}°C (threshold <= -18°C). Quarantined.`
            : `Verified batch intake at ${temperature}°C. Passed cold-chain verification.${note}`,
          performedBy: data.staffUserId || 'Hub Operations',
        },
      });

      return {
        batch,
        temperatureVerified: !tempBreach,
        status: batchStatus,
        message: tempBreach
          ? `ALERT: Intake temperature (${temperature}°C) exceeded -18°C threshold. Batch has been marked as QUARANTINED.`
          : batchStatus === 'damaged'
            ? `Added ${quantity} units to quarantined batch ${batchNumber}.${note}`
            : `Verified sub-zero batch intake (${temperature}°C). Added to available sellable inventory.`,
      };
    });
  }

  /**
   * Get all batches for a hub with FEFO (First Expired, First Out) ordering.
   */
  async getHubBatches(
    hubId: string,
    filters: {
      status?: string;
      search?: string;
    } = {}
  ) {
    const hub = await prisma.hubCenter.findUnique({ where: { id: hubId } });
    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');

    const where: any = { hubId };

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'quarantined') {
        where.status = 'damaged';
      } else {
        where.status = filters.status;
      }
    }

    if (filters.search) {
      where.OR = [
        { batchNumber: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search, mode: 'insensitive' } },
        { product: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    // FEFO: Sort by expiryDate ASC
    const batches = await prisma.hubInventory.findMany({
      where,
      include: {
        product: {
          include: {
            seller: {
              select: {
                id: true,
                businessName: true,
                isVerified: true,
              },
            },
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const now = new Date();
    const formattedBatches = batches.map((batch, index) => {
      const expiry = new Date(batch.expiryDate);
      const diffMs = expiry.getTime() - now.getTime();
      const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const isExpired = daysUntilExpiry <= 0;
      const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 7;

      return {
        id: batch.id,
        fefoPriority: index + 1,
        batchNumber: batch.batchNumber,
        barcode: batch.barcode,
        quantity: batch.quantity,
        status: batch.status,
        storageUnit: batch.storageUnit || 'FREEZER-01',
        manufacturedDate: batch.manufacturedDate,
        expiryDate: batch.expiryDate,
        daysUntilExpiry,
        isExpired,
        isExpiringSoon,
        product: {
          id: batch.product.id,
          name: batch.product.name,
          nameUrdu: batch.product.nameUrdu,
          price: Number(batch.product.price),
          image: batch.product.images[0]?.imageUrl || null,
          seller: {
            id: batch.product.seller.id,
            businessName: batch.product.seller.businessName,
            isVerified: batch.product.seller.isVerified,
          },
        },
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      };
    });

    // Calculate aggregated metrics
    const allHubBatches = await prisma.hubInventory.findMany({
      where: { hubId },
      select: { status: true, quantity: true, expiryDate: true },
    });

    const totalBatches = allHubBatches.length;
    const availableCount = allHubBatches.filter((b) => b.status === 'available').length;
    const quarantinedCount = allHubBatches.filter((b) => b.status === 'damaged').length;
    const expiredCount = allHubBatches.filter((b) => new Date(b.expiryDate) <= now).length;
    const expiringSoonCount = allHubBatches.filter((b) => {
      const days = Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 7;
    }).length;
    const totalSellableUnits = allHubBatches
      .filter((b) => b.status === 'available')
      .reduce((sum, b) => sum + b.quantity, 0);

    return {
      hub: {
        id: hub.id,
        name: hub.name,
        code: hub.code,
        city: hub.city,
        area: hub.area,
        address: hub.address,
        temperatureCelsius: hub.temperatureCelsius ? Number(hub.temperatureCelsius) : null,
      },
      summary: {
        totalBatches,
        availableCount,
        quarantinedCount,
        expiredCount,
        expiringSoonCount,
        totalSellableUnits,
      },
      batches: formattedBatches,
    };
  }

  /**
   * Update batch status (e.g. quarantine or release to sellable).
   * Releasing needs care: an expired batch can never be released, and releasing a
   * quarantined one needs a written reason (it puts possibly-compromised stock back on sale).
   */
  async updateBatchStatus(data: {
    hubId: string;
    batchId: string;
    status: 'available' | 'damaged' | 'reserved' | 'expired';
    reason?: string;
    performedBy?: string;
  }) {
    if (!['available', 'damaged', 'reserved', 'expired'].includes(data.status)) {
      throw new AppError('Invalid batch status', 400, 'INVALID_STATUS');
    }

    return prisma.$transaction(async (tx) => {
      // Lock the row: an order allocating from this batch at the same moment must see the new status.
      await tx.$queryRaw`SELECT id FROM hub_inventory WHERE id = ${data.batchId} FOR UPDATE`;
      const batch = await tx.hubInventory.findFirst({
        where: { id: data.batchId, hubId: data.hubId },
      });

      if (!batch) {
        throw new AppError('Batch inventory record not found in this hub', 404, 'BATCH_NOT_FOUND');
      }

      const previousStatus = batch.status;
      if (data.status === 'available') {
        if (batch.expiryDate.getTime() <= Date.now()) {
          throw new AppError('An expired batch cannot be released to sellable stock', 400, 'BATCH_EXPIRED');
        }
        if (previousStatus === 'damaged' && (data.reason ?? '').trim().length < 5) {
          throw new AppError(
            'A reason is required to release a quarantined batch',
            400,
            'REASON_REQUIRED'
          );
        }
      }

      const updated = await tx.hubInventory.update({
        where: { id: data.batchId },
        data: { status: data.status },
      });

      await tx.hubInventoryLog.create({
        data: {
          hubInventoryId: batch.id,
          action: data.status === 'available' ? 'adjustment' : 'expired',
          quantityChange: 0,
          previousQuantity: batch.quantity,
          newQuantity: batch.quantity,
          reason: data.reason || `Status updated from ${previousStatus} to ${data.status}`,
          performedBy: data.performedBy || 'Hub Manager',
        },
      });

      return {
        batch: updated,
        previousStatus,
        newStatus: data.status,
        message: `Batch status changed to ${data.status}`,
      };
    });
  }

  /**
   * Mark batches that have passed their expiry as expired, so they stop showing as
   * available anywhere (the sellable filters already ignore them; this fixes the
   * status the hub dashboard and counts read). Run on a timer.
   */
  async expireStaleBatches(): Promise<number> {
    // One atomic UPDATE ... RETURNING: only batches this call actually flipped are logged,
    // so a concurrent sweep (or a batch changed since a read) can't produce a duplicate or
    // false 'expired' entry.
    const flipped: Array<{ id: string; quantity: number }> = await prisma.$queryRaw`
      UPDATE hub_inventory SET status = 'expired'
      WHERE status = 'available' AND expiry_date <= NOW()
      RETURNING id, quantity`;
    if (flipped.length === 0) return 0;
    await prisma.hubInventoryLog.createMany({
      data: flipped.map((b) => ({
        hubInventoryId: b.id,
        action: 'expired',
        quantityChange: 0,
        previousQuantity: b.quantity,
        newQuantity: b.quantity,
        reason: 'Batch passed its expiry date',
        performedBy: 'System',
      })),
    });
    return flipped.length;
  }

  /**
   * A hub manager may only operate the hubs assigned to them (admins: any). A hub with no
   * manager yet is run by admins until one is assigned (Admin > Hubs).
   */
  async assertHubAccess(hubId: string, user: { userId?: string; id?: string; userType: string }) {
    if (user.userType === 'admin') return;
    const hub = await prisma.hubCenter.findUnique({ where: { id: hubId }, select: { managerId: true } });
    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');
    const uid = user.userId ?? user.id;
    if (!hub.managerId || hub.managerId !== uid) {
      throw new AppError('You do not manage this hub', 403, 'HUB_ACCESS_DENIED');
    }
  }

  /** Assign (or clear) the manager of a hub. Admin only (enforced by the route). */
  async assignManager(hubId: string, managerId: string | null) {
    const hub = await prisma.hubCenter.findUnique({ where: { id: hubId } });
    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');
    if (managerId) {
      const user = await prisma.user.findUnique({ where: { id: managerId }, select: { userType: true, status: true } });
      if (!user || user.userType !== 'hub_manager' || user.status !== 'active') {
        throw new AppError('The manager must be an active hub manager account', 400, 'INVALID_MANAGER');
      }
    }
    const updated = await prisma.hubCenter.update({ where: { id: hubId }, data: { managerId } });
    return { id: updated.id, managerId: updated.managerId };
  }

  /**
   * Record a temperature probe log for the hub.
   */
  async recordTemperatureProbe(data: {
    hubId: string;
    temperatureCelsius: number;
    freezerUnit?: number;
    notes?: string;
  }) {
    if (!Number.isFinite(data.temperatureCelsius) || data.temperatureCelsius < -100 || data.temperatureCelsius > 100) {
      throw new AppError('A valid temperature reading is required', 400, 'INVALID_TEMPERATURE');
    }
    const hub = await prisma.hubCenter.findUnique({ where: { id: data.hubId } });
    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');

    const tempBreach = Number(data.temperatureCelsius) > -18.0;

    const log = await prisma.hubTemperatureLog.create({
      data: {
        hubId: data.hubId,
        temperatureCelsius: data.temperatureCelsius,
        freezerUnit: data.freezerUnit || 1,
        isAlert: tempBreach,
      },
    });

    // Update current hub temperature
    await prisma.hubCenter.update({
      where: { id: data.hubId },
      data: {
        temperatureCelsius: data.temperatureCelsius,
      },
    });

    return {
      log,
      isAlert: tempBreach,
      message: tempBreach
        ? `ALERT: Temperature reading of ${data.temperatureCelsius}°C exceeds -18°C sub-zero cold-chain threshold!`
        : `Temperature probe verified at ${data.temperatureCelsius}°C (Sub-Zero Compliant).`,
    };
  }

  /**
   * Get temperature probe history and alert statistics for a hub.
   */
  async getTemperatureLogs(hubId: string, limit: number = 50) {
    // Bound it: NaN used to 500 and a huge value ran an unbounded query.
    limit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 500) : 50;
    const hub = await prisma.hubCenter.findUnique({ where: { id: hubId } });
    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');

    const logs = await prisma.hubTemperatureLog.findMany({
      where: { hubId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });

    const temps = logs.map((l) => Number(l.temperatureCelsius));
    const minTemp = temps.length ? Math.min(...temps) : null;
    const maxTemp = temps.length ? Math.max(...temps) : null;
    const avgTemp = temps.length ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(2)) : null;
    const breachCount = logs.filter((l) => l.isAlert).length;

    return {
      hub: {
        id: hub.id,
        name: hub.name,
        code: hub.code,
        currentTemp: hub.temperatureCelsius ? Number(hub.temperatureCelsius) : null,
      },
      statistics: {
        totalReadings: logs.length,
        breachCount,
        complianceRate: logs.length ? Math.round(((logs.length - breachCount) / logs.length) * 100) : 100,
        minTemp,
        maxTemp,
        avgTemp,
      },
      logs: logs.map((l) => ({
        id: l.id,
        temperatureCelsius: Number(l.temperatureCelsius),
        freezerUnit: l.freezerUnit,
        isAlert: l.isAlert,
        recordedAt: l.recordedAt,
      })),
    };
  }

  /**
   * Get overall hub operations stats.
   */
  async getHubStats(hubId: string) {
    const hub = await prisma.hubCenter.findUnique({
      where: { id: hubId },
      include: {
        inventory: true,
        temperatureLogs: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');

    const now = new Date();
    const totalSellableUnits = hub.inventory
      .filter((i) => i.status === 'available')
      .reduce((sum, i) => sum + i.quantity, 0);

    const quarantinedBatches = hub.inventory.filter((i) => i.status === 'damaged').length;
    const expiringSoonBatches = hub.inventory.filter((i) => {
      const days = Math.ceil((new Date(i.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 7;
    }).length;

    return {
      id: hub.id,
      name: hub.name,
      code: hub.code,
      city: hub.city,
      area: hub.area,
      address: hub.address,
      capacityCubicFeet: hub.capacityCubicFeet,
      currentUtilization: Number(hub.currentUtilization),
      freezerUnits: hub.freezerUnits,
      temperatureCelsius: hub.temperatureCelsius ? Number(hub.temperatureCelsius) : null,
      status: hub.status,
      metrics: {
        totalBatches: hub.inventory.length,
        totalSellableUnits,
        quarantinedBatches,
        expiringSoonBatches,
        recentLogsCount: hub.temperatureLogs.length,
        latestAlert: hub.temperatureLogs.find((l) => l.isAlert) || null,
      },
    };
  }
}

export default new HubService();

