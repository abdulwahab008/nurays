import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

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
          where: { quantity: { gt: 0 } },
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
      availableProductsCount: hub.inventory.length,
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

    const where: any = {
      hubId,
      quantity: { gt: 0 },
    };

    if (filters.categoryId) {
      where.product = {
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
    const hub = await prisma.hubCenter.findUnique({ where: { id: data.hubId } });
    if (!hub) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');

    let sellerId = data.sellerId;
    if (!sellerId) {
      const product = await prisma.product.findUnique({ where: { id: data.productId } });
      if (!product) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      sellerId = product.sellerId;
    }

    const tempBreach = Number(data.measuredTemperatureCelsius) > -18.0;
    const batchStatus = tempBreach ? 'damaged' : 'available';

    // Check if batch with this batchNumber already exists for this hub & product
    const existingBatch = await prisma.hubInventory.findUnique({
      where: {
        hubId_productId_batchNumber: {
          hubId: data.hubId,
          productId: data.productId,
          batchNumber: data.batchNumber,
        },
      },
    });

    let batch;
    let previousQuantity = 0;
    let newQuantity = data.quantity;

    if (existingBatch) {
      previousQuantity = existingBatch.quantity;
      newQuantity = existingBatch.quantity + data.quantity;
      batch = await prisma.hubInventory.update({
        where: { id: existingBatch.id },
        data: {
          quantity: newQuantity,
          expiryDate: new Date(data.expiryDate),
          manufacturedDate: data.manufacturedDate ? new Date(data.manufacturedDate) : existingBatch.manufacturedDate,
          storageUnit: data.storageUnit || existingBatch.storageUnit || 'FREEZER-01',
          barcode: data.barcode || existingBatch.barcode,
          status: batchStatus,
        },
      });
    } else {
      batch = await prisma.hubInventory.create({
        data: {
          hubId: data.hubId,
          productId: data.productId,
          sellerId,
          quantity: data.quantity,
          batchNumber: data.batchNumber,
          manufacturedDate: data.manufacturedDate ? new Date(data.manufacturedDate) : undefined,
          expiryDate: new Date(data.expiryDate),
          storageUnit: data.storageUnit || 'FREEZER-01',
          barcode: data.barcode,
          status: batchStatus,
        },
      });
    }

    // Record temperature log
    await prisma.hubTemperatureLog.create({
      data: {
        hubId: data.hubId,
        temperatureCelsius: data.measuredTemperatureCelsius,
        freezerUnit: data.storageUnit ? parseInt(data.storageUnit.replace(/\D/g, '')) || 1 : 1,
        isAlert: tempBreach,
      },
    });

    // Update hub current temperature reading
    await prisma.hubCenter.update({
      where: { id: data.hubId },
      data: {
        temperatureCelsius: data.measuredTemperatureCelsius,
      },
    });

    // Record intake audit log
    await prisma.hubInventoryLog.create({
      data: {
        hubInventoryId: batch.id,
        action: tempBreach ? 'expired' : 'stock_in',
        quantityChange: data.quantity,
        previousQuantity,
        newQuantity,
        reason: tempBreach
          ? `COLD CHAIN VIOLATION: Batch intake measured at ${data.measuredTemperatureCelsius}°C (threshold <= -18°C). Quarantined.`
          : `Verified batch intake at ${data.measuredTemperatureCelsius}°C. Passed cold-chain verification.`,
        performedBy: data.staffUserId || 'Hub Operations',
      },
    });

    return {
      batch,
      temperatureVerified: !tempBreach,
      status: batchStatus,
      message: tempBreach
        ? `ALERT: Intake temperature (${data.measuredTemperatureCelsius}°C) exceeded -18°C threshold. Batch has been marked as QUARANTINED.`
        : `Verified sub-zero batch intake (${data.measuredTemperatureCelsius}°C). Added to available sellable inventory.`,
    };
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
   * Update batch status (e.g. quarantine or release to sellable)
   */
  async updateBatchStatus(data: {
    hubId: string;
    batchId: string;
    status: 'available' | 'damaged' | 'reserved' | 'expired';
    reason?: string;
    performedBy?: string;
  }) {
    const batch = await prisma.hubInventory.findFirst({
      where: { id: data.batchId, hubId: data.hubId },
    });

    if (!batch) {
      throw new AppError('Batch inventory record not found in this hub', 404, 'BATCH_NOT_FOUND');
    }

    const previousStatus = batch.status;
    const updated = await prisma.hubInventory.update({
      where: { id: data.batchId },
      data: { status: data.status },
    });

    await prisma.hubInventoryLog.create({
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

