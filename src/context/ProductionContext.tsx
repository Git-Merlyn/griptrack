import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Production } from '../lib/types';
import { useAuthContext } from './AuthContext';

// AsyncStorage key — per org so each org has its own sticky active production
const storageKey = (orgId: string) => `gt_active_production_${orgId}`;

interface ProductionContextValue {
  productions: Production[];
  activeProductionId: string | null; // null = General pool
  activeProduction: Production | null;
  loadingProductions: boolean;
  setActiveProductionId: (id: string | null) => void;
  refreshProductions: () => Promise<void>;
}

const ProductionContext = createContext<ProductionContextValue | null>(null);

export function ProductionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuthContext();
  const orgId = profile?.org_id ?? null;

  const [productions, setProductions] = useState<Production[]>([]);
  const [loadingProductions, setLoadingProductions] = useState(true);
  const [activeProductionId, setActiveProductionIdState] = useState<string | null>(null);

  // Hydrate active production from AsyncStorage once orgId is known
  useEffect(() => {
    if (!orgId) return;
    AsyncStorage.getItem(storageKey(orgId)).then((stored) => {
      setActiveProductionIdState(stored ?? null);
    });
  }, [orgId]);

  const setActiveProductionId = useCallback(
    (id: string | null) => {
      setActiveProductionIdState(id);
      if (!orgId) return;
      if (id) {
        AsyncStorage.setItem(storageKey(orgId), id);
      } else {
        AsyncStorage.removeItem(storageKey(orgId));
      }
    },
    [orgId]
  );

  const loadProductions = useCallback(async () => {
    if (!orgId) return;
    setLoadingProductions(true);
    try {
      const { data, error } = await supabase
        .from('productions')
        .select('id, org_id, name, status, start_date, end_date, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data ?? []) as Production[];
      setProductions(list);

      // If stored production was deleted or archived, fall back to General pool
      setActiveProductionIdState((current) => {
        if (current && !list.some((p) => p.id === current)) {
          AsyncStorage.removeItem(storageKey(orgId));
          return null;
        }
        return current;
      });
    } catch (err) {
      console.error('Failed to load productions', err);
      setProductions([]);
    } finally {
      setLoadingProductions(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadProductions();
  }, [loadProductions]);

  const activeProduction = productions.find((p) => p.id === activeProductionId) ?? null;

  return (
    <ProductionContext.Provider
      value={{
        productions,
        activeProductionId,
        activeProduction,
        loadingProductions,
        setActiveProductionId,
        refreshProductions: loadProductions,
      }}
    >
      {children}
    </ProductionContext.Provider>
  );
}

export function useProductionContext(): ProductionContextValue {
  const ctx = useContext(ProductionContext);
  if (!ctx) throw new Error('useProductionContext must be used within <ProductionProvider>');
  return ctx;
}
