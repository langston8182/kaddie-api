import { IProduct } from '../models/product.model';
import { IShoppingItem } from '../models/shoppingItem.model';
import { ITemplate } from '../models/template.model';
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
    isPinned: item.isPinned ?? false,
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

export function templateToDto(template: ITemplate) {
  return {
    id: template.id,
    name: template.name,
    items: template.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      note: i.note,
    })),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
