import prisma from '../config/database';

/** Is this image address still attached to a product (so deleting its files would break the product's photo)? */
export async function imageInUse(url: string): Promise<boolean> {
  return (await prisma.productImage.count({ where: { imageUrl: url } })) > 0;
}

/**
 * Is a file uploaded before the storage layer (named by its file name only) attached to one of this user's own kitchen's
 * products? Only then may the user delete it.
 */
export async function isOwnLegacyImage(userId: string, filename: string): Promise<boolean> {
  return (
    (await prisma.productImage.count({
      where: { imageUrl: { endsWith: `/${filename}` }, product: { seller: { userId } } },
    })) > 0
  );
}
