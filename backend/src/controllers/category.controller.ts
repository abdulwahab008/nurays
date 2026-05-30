import { Request, Response } from 'express';
import categoryService from '../services/category.service';

export const getCategories = async (req: Request, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const categories = await categoryService.getCategories(includeInactive);

  res.status(200).json({
    success: true,
    data: categories,
  });
};

/**
 * Get categories grouped by product type
 * Returns: { frozen: [...], fresh: [...], ready_to_eat: [...], ready_to_cook: [...] }
 */
export const getCategoriesByProductType = async (req: Request, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const categories = await categoryService.getCategoriesByProductType(includeInactive);

  res.status(200).json({
    success: true,
    data: categories,
  });
};

export const getCategory = async (req: Request, res: Response) => {
  const { identifier } = req.params;
  const category = await categoryService.getCategoryByIdentifier(identifier);

  res.status(200).json({
    success: true,
    data: category,
  });
};

export const createCategory = async (req: Request, res: Response) => {
  const category = await categoryService.createCategory(req.body);

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: category,
  });
};

export const updateCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const category = await categoryService.updateCategory(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Category updated successfully',
    data: category,
  });
};

export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await categoryService.deleteCategory(id);

  res.status(200).json({
    success: true,
    message: result.message,
  });
};

