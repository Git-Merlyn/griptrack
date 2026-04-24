import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '../lib/types';
import InventoryListScreen from '../screens/inventory/InventoryListScreen';
import ItemDetailScreen from '../screens/inventory/ItemDetailScreen';

const Stack = createNativeStackNavigator<InventoryStackParamList>();

export default function InventoryStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1d23' },
        headerTintColor: '#4debf9',
        headerTitleStyle: { color: '#f1f5f9', fontWeight: '600' },
      }}
    >
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
    </Stack.Navigator>
  );
}
