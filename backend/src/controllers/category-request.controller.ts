import { Request, Response } from 'express';
import { categoryRequestService } from '../services/category-request.service';

// Create a category request (seller)
export const createCategoryRequest = async (req: Request, res: Response) => {
  try {
    const sellerId = (req as any).seller?.id;
    
    if (!sellerId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_A_SELLER',
          message: 'Only sellers can request new categories',
        },
      });
    }

    const { productType, name, nameUrdu, suggestedName, suggestedNameUrdu, description, parentCategoryId } = req.body;

    // Support both field naming conventions
    const categoryName = name || suggestedName;
    const categoryNameUrdu = nameUrdu || suggestedNameUrdu;

    if (!productType || !categoryName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Product type and category name are required',
        },
      });
    }

    const request = await categoryRequestService.createRequest({
      sellerId,
      productType,
      name: categoryName.trim(),
      nameUrdu: categoryNameUrdu?.trim(),
      description: description?.trim(),
      parentCategoryId,
    });

    return res.status(201).json({
      success: true,
      data: request,
      message: 'Category request submitted successfully. Admin will review it shortly.',
    });
  } catch (error: any) {
    console.error('Create category request error:', error);
    return res.status(400).json({
      success: false,
      error: {
        code: 'REQUEST_FAILED',
        message: error.message || 'Failed to submit category request',
      },
    });
  }
};

// Get seller's category requests
export const getMyRequests = async (req: Request, res: Response) => {
  try {
    const sellerId = (req as any).seller?.id;
    
    if (!sellerId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_A_SELLER',
          message: 'Only sellers can view their requests',
        },
      });
    }

    const requests = await categoryRequestService.getSellerRequests(sellerId);

    return res.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    console.error('Get my requests error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch category requests',
      },
    });
  }
};

// Get all category requests (admin)
export const getAllRequests = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    const requests = await categoryRequestService.getAllRequests(status as string);

    res.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    console.error('Get all requests error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch category requests',
      },
    });
  }
};

// Get single request by ID (admin)
export const getRequestById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await categoryRequestService.getRequestById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Category request not found',
        },
      });
    }

    return res.json({
      success: true,
      data: request,
    });
  } catch (error: any) {
    console.error('Get request by ID error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch category request',
      },
    });
  }
};

// Approve a category request (admin)
export const approveRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?.id;
    const customSlug = req.body?.customSlug;

    const category = await categoryRequestService.approveRequest(id, adminId, customSlug);

    res.json({
      success: true,
      data: category,
      message: 'Category request approved and category created successfully',
    });
  } catch (error: any) {
    console.error('Approve request error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'APPROVAL_FAILED',
        message: error.message || 'Failed to approve category request',
      },
    });
  }
};

// Reject a category request (admin)
export const rejectRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?.id;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Rejection reason is required',
        },
      });
    }

    const updated = await categoryRequestService.rejectRequest(id, adminId, reason);

    return res.json({
      success: true,
      data: updated,
      message: 'Category request rejected',
    });
  } catch (error: any) {
    console.error('Reject request error:', error);
    return res.status(400).json({
      success: false,
      error: {
        code: 'REJECTION_FAILED',
        message: error.message || 'Failed to reject category request',
      },
    });
  }
};

// Get pending count (admin dashboard)
export const getPendingCount = async (_req: Request, res: Response) => {
  try {
    const count = await categoryRequestService.getPendingCount();

    return res.json({
      success: true,
      data: { count },
    });
  } catch (error: any) {
    console.error('Get pending count error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch pending count',
      },
    });
  }
};
