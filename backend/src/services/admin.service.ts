import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class AdminService {
  /**
   * Get pending sellers
   */
  async getPendingSellers() {
    const sellers = await prisma.seller.findMany({
      where: {
        verificationStatus: 'pending',
      },
      include: {
        user: {
          include: {
            profile: {
              select: {
                fullName: true,
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return sellers.map((seller) => ({
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      user: {
        id: seller.user.id,
        phone: seller.user.phone,
        email: seller.user.email,
        profile: seller.user.profile
          ? {
              fullName: seller.user.profile.fullName,
              city: seller.user.profile.city,
            }
          : null,
      },
      createdAt: seller.createdAt,
    }));
  }

  /**
   * Approve or reject seller
   */
  async approveRejectSeller(
    sellerId: string,
    _adminId: string,
    approved: boolean,
    notes?: string
  ) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    if (seller.verificationStatus !== 'pending') {
      throw new AppError(
        `Seller already ${seller.verificationStatus}`,
        400,
        'SELLER_ALREADY_PROCESSED'
      );
    }

    const updatedSeller = await prisma.seller.update({
      where: { id: sellerId },
      data: {
        verificationStatus: approved ? 'approved' : 'rejected',
        isVerified: approved,
        status: approved ? 'active' : 'inactive',
        rejectionReason: approved ? null : notes || 'Application rejected',
      },
    });

    // Update user type if approved
    if (approved) {
      await prisma.user.update({
        where: { id: seller.userId },
        data: { userType: 'seller' },
      });
    }

    return {
      sellerId: updatedSeller.id,
      verificationStatus: updatedSeller.verificationStatus,
      isVerified: updatedSeller.isVerified,
      status: updatedSeller.status,
      message: approved ? 'Seller approved successfully' : 'Seller rejected',
    };
  }

  /**
   * Get one seller by ID (admin)
   */
  async getSellerById(sellerId: string) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      include: {
        user: {
          include: {
            profile: {
              select: {
                fullName: true,
                city: true,
                area: true,
              },
            },
          },
        },
      },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const productCount = await prisma.product.count({
      where: { sellerId: seller.id },
    });

    return {
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      verificationStatus: seller.verificationStatus,
      status: seller.status,
      rejectionReason: seller.rejectionReason,
      isVerified: seller.isVerified,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
      productCount,
      user: {
        id: seller.user.id,
        email: seller.user.email,
        phone: seller.user.phone,
        profile: seller.user.profile
          ? {
              fullName: seller.user.profile.fullName,
              city: seller.user.profile.city,
              area: seller.user.profile.area,
            }
          : null,
      },
    };
  }

  /**
   * Get all sellers (with optional filtering)
   */
  async getAllSellers(filters: {
    status?: string;
    verificationStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }

    const [sellers, total] = await Promise.all([
      prisma.seller.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.seller.count({ where }),
    ]);

    return {
      sellers: sellers.map((seller) => ({
        id: seller.id,
        businessName: seller.businessName,
        businessNameUrdu: seller.businessNameUrdu,
        verificationStatus: seller.verificationStatus,
        status: seller.status,
        createdAt: seller.createdAt,
        user: {
          email: seller.user.email,
          phone: seller.user.phone,
          profile: seller.user.profile
            ? {
                fullName: seller.user.profile.fullName,
              }
            : null,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Moderate product (approve/reject)
   */
  async moderateProduct(
    productId: string,
    _adminId: string,
    approved: boolean,
    reason?: string
  ) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        approvalStatus: approved ? 'approved' : 'rejected',
        isActive: approved ? product.isActive : false,
        rejectionReason: approved ? null : reason || 'Product rejected',
      },
    });

    return {
      productId: updatedProduct.id,
      approvalStatus: updatedProduct.approvalStatus,
      isActive: updatedProduct.isActive,
      message: approved ? 'Product approved' : 'Product rejected',
    };
  }
}

export default new AdminService();

