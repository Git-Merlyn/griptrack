import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '../lib/types';
import InventoryListScreen from '../screens/inventory/InventoryListScreen';
import ItemDetailScreen from '../screens/inventory/ItemDetailScreen';
import ItemFormScreen from '../screens/inventory/ItemFormScreen';
import AuditLogScreen from '../screens/inventory/AuditLogScreen';

const Stack = createNativeStackNavigator<InventoryStackParamList>();

const HEADER = {
  headerStyle: { backgroundColor: '#1a1d23' },
  headerTintColor: '#4debf9',
  headerTitleStyle: { color: '#f1f5f9', fontWeight: '600' as const },
};

export default function InventoryStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
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
    </Stack.Navigator>
  );
}
