import prisma from '../config/database';
import { notifySeller } from './notify.service';
import { notifyApprovers } from './approvals.service';

interface CreateCategoryRequestData {
  sellerId: string;
  productType: string;
  name: string;
  nameUrdu?: string;
  description?: string;
  parentCategoryId?: string;
}

class CategoryRequestService {
  // Create a new category request (seller)
  async createRequest(data: CreateCategoryRequestData) {
    // Check if similar request already exists
    const existingRequest = await prisma.categoryRequest.findFirst({
      where: {
        sellerId: data.sellerId,
        name: { equals: data.name, mode: 'insensitive' },
        status: 'pending',
      },
    });

    if (existingRequest) {
      throw new Error('You already have a pending request for this category');
    }

    // Check if category already exists
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: { equals: data.name, mode: 'insensitive' },
        productType: data.productType,
      },
    });

    if (existingCategory) {
      throw new Error('A category with this name already exists');
    }

    // Validate parent category if provided
    if (data.parentCategoryId) {
      const parentCategory = await prisma.category.findUnique({
        where: { id: data.parentCategoryId },
        select: { id: true, name: true, productType: true },
      });

      if (!parentCategory) {
        throw new Error('Parent category not found');
      }

      // Ensure parent category matches the product type
      if (parentCategory.productType && parentCategory.productType !== data.productType) {
        throw new Error('Parent category product type does not match');
      }
    }

    notifyApprovers({ title: 'New category request', message: `A kitchen asked for the category "${data.name}".`, actionUrl: '/admin/category-requests', dedupeKey: `category-request:${data.sellerId}:${data.name.toLowerCase()}:${Date.now()}` });
    return prisma.categoryRequest.create({
      data: {
        sellerId: data.sellerId,
        productType: data.productType,
        name: data.name,
        nameUrdu: data.nameUrdu,
        description: data.description,
        parentCategoryId: data.parentCategoryId,
        status: 'pending',
      },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            businessNameUrdu: true,
          },
        },
        parentCategory: {
          select: {
            id: true,
            name: true,
            nameUrdu: true,
          },
        },
      },
    });
  }

  // Get all requests for a seller
  async getSellerRequests(sellerId: string) {
    return prisma.categoryRequest.findMany({
      where: { sellerId },
      include: {
        parentCategory: {
          select: {
            id: true,
            name: true,
            nameUrdu: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get all pending requests (admin)
  async getAllRequests(status?: string) {
    const where = status ? { status } : {};

    return prisma.categoryRequest.findMany({
      where,
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            businessNameUrdu: true,
            user: {
              select: {
                phone: true,
                email: true,
              },
            },
          },
        },
        parentCategory: {
          select: {
            id: true,
            name: true,
            nameUrdu: true,
            productType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get request by ID
  async getRequestById(id: string) {
    return prisma.categoryRequest.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            businessNameUrdu: true,
            user: {
              select: {
                phone: true,
                email: true,
              },
            },
          },
        },
        parentCategory: {
          select: {
            id: true,
            name: true,
            nameUrdu: true,
            productType: true,
          },
        },
      },
    });
  }

  // Approve a category request (admin)
  async approveRequest(requestId: string, adminId: string, customSlug?: string) {
    const request = await prisma.categoryRequest.findUnique({
      where: { id: requestId },
      include: {
        parentCategory: true,
      },
    });

    if (!request) {
      throw new Error('Category request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('This request has already been processed');
    }

    // Generate slug
    const baseSlug = customSlug || request.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    let counter = 1;

    // Ensure unique slug
    while (await prisma.category.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Claim the request and create the category together: a second click (or a second
    // admin) finds it no longer pending instead of creating the category twice.
    const category = await prisma.$transaction(async (tx) => {
      const claimed = await tx.categoryRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'approved', reviewedBy: adminId, reviewedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error('This request has already been processed');
      const created = await tx.category.create({
        data: {
          name: request.name,
          nameUrdu: request.nameUrdu,
          description: request.description,
          productType: request.parentCategoryId ? null : request.productType, // Only parent categories have productType
          parentId: request.parentCategoryId,
          slug,
          isActive: true,
        },
      });
      await tx.categoryRequest.update({ where: { id: requestId }, data: { adminNotes: `Category created with ID: ${created.id}` } });
      return created;
    });

    await notifySeller(request.sellerId, {
      title: 'Category approved',
      message: `"${request.name}" is now a category. You can list your dishes in it.`,
      actionUrl: '/sellers/products/new',
      dedupeKey: `category-request:${requestId}:approved`,
    });

    return category;
  }

  // Reject a category request (admin)
  async rejectRequest(requestId: string, adminId: string, reason: string) {
    const request = await prisma.categoryRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error('Category request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('This request has already been processed');
    }

    const updated = await prisma.categoryRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        adminNotes: reason,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    });

    await notifySeller(request.sellerId, {
      title: 'Category request not approved',
      message: `"${request.name}" wasn't added: ${reason}`,
      actionUrl: '/sellers/products/new',
      dedupeKey: `category-request:${requestId}:rejected`,
    });

    return updated;
  }

  // Get pending count (for admin dashboard)
  async getPendingCount() {
    return prisma.categoryRequest.count({
      where: { status: 'pending' },
    });
  }
}

export const categoryRequestService = new CategoryRequestService();
