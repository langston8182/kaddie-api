import { IProduct } from '../models/product.model';
import { IShoppingItem } from '../models/shoppingItem.model';
import { IShoppingList } from '../models/shoppingList.model';

export interface ListCounts {
  remainingCount: number;
  totalCount: number;
}

export function listToDto(list: IShoppingList, counts?: ListCounts) {
  return {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    ...(counts ?? {}),
  };
}

export function itemToDto(item: IShoppingItem) {
  return {
    id: item.id,
    listId: item.listId,
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    purchasedQuantity: item.purchasedQuantity,
    isPurchased: item.isPurchased,
    note: item.note,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function productToDto(product: IProduct) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    usageCount: product.usageCount,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
