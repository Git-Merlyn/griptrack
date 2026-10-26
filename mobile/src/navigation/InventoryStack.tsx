import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '../lib/types';
import InventoryListScreen from '../screens/inventory/InventoryListScreen';
import ItemDetailScreen from '../screens/inventory/ItemDetailScreen';
import ItemFormScreen from '../screens/inventory/ItemFormScreen';
import AuditLogScreen from '../screens/inventory/AuditLogScreen';
import PDFReviewScreen from '../screens/inventory/PDFReviewScreen';
import { STACK_HEADER } from './stackHeader';

const Stack = createNativeStackNavigator<InventoryStackParamList>();


export default function InventoryStack() {
  return (
    <Stack.Navigator screenOptions={STACK_HEADER}>
      <Stack.Screen
        name="InventoryList"
        component={InventoryListScreen}
        options={{ title: 'Inventory' }}
      />
      <Stack.Screen
        name="ItemDetail"
        component={ItemDetailScreen}
        options={{ title: 'Item Detail' }}
      />
      <Stack.Screen
        name="ItemForm"
        component={ItemFormScreen}
        options={{ title: 'Add Item' }} // overridden in screen via useLayoutEffect
      />
      <Stack.Screen
        name="AuditLog"
        component={AuditLogScreen}
        options={{ title: 'Item History' }}
      />
      <Stack.Screen
        name="PDFReview"
        component={PDFReviewScreen}
        options={{ title: 'Review Import' }}
      />
    </Stack.Navigator>
  );
}
