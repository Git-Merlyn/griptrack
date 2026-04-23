import { useState, useEffect, useCallback, useContext } from "react";
import ProductionContext from "./ProductionContext";
import UserContext from "./UserContext";
import { supabase } from "../lib/supabaseClient";

// localStorage key per org so each org has its own sticky active production
const lsKey = (orgId) => `gt_active_production_${orgId}`;

export const ProductionProvider = ({ children }) => {
  const { orgId } = useContext(UserContext) || {};

  const [productions, setProductions] = useState([]);
  const [loadingProductions, setLoadingProductions] = useState(true);

  // Restore active production from localStorage, or default to null (General)
  const [activeProductionId, setActiveProductionIdState] = useState(() => {
    // We don't have orgId yet at init, so we'll hydrate in the useEffect below.
    return null;
  });

  // Hydrate from localStorage once orgId is known
  useEffect(() => {
    if (!orgId) return;
    const stored = localStorage.getItem(lsKey(orgId));
    // stored is either a UUID string or null/missing
    setActiveProductionIdState(stored || null);
  }, [orgId]);

  const setActiveProductionId = (id) => {
    setActiveProductionIdState(id);
    if (orgId) {
      if (id) {
        localStorage.setItem(lsKey(orgId), id);
      } else {
        localStorage.removeItem(lsKey(orgId));
      }
    }
  };

  const loadProductions = useCallback(async () => {
    if (!orgId) return;
    setLoadingProductions(true);
    try {
      const { data, error } = await supabase
        .from("productions")
        .select("id, name, status, start_date, end_date, created_by, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProductions(data ?? []);

      // If the stored production no longer exists (deleted/not in org), fall back to General
      if (activeProductionId) {
        const stillExists = (data ?? []).some((p) => p.id === activeProductionId);
        if (!stillExists) {
          setActiveProductionId(null);
        }
      }
    } catch (err) {
      console.error("Failed to load productions", err);
      setProductions([]);
    } finally {
      setLoadingProductions(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    loadProductions();
  }, [loadProductions]);

  // If the activeProductionId was just restored from localStorage, re-validate it
  // once productions have loaded (handled inside loadProductions above).

  const createProduction = async ({ name, startDate, endDate, createdBy }) => {
    if (!orgId) throw new Error("No organization found");

    const trimmed = String(name || "").trim();
    if (!trimmed) throw new Error("Production name is required");

    const { data, error } = await supabase
      .from("productions")
      .insert({
        org_id: orgId,
        name: trimmed,
        start_date: startDate || null,
        end_date: endDate || null,
        created_by: createdBy || null,
      })
      .select("id, name, status, start_date, end_date, created_by, created_at")
      .single();

    if (error) throw error;

    setProductions((prev) => [data, ...prev]);
    return data;
  };

  const archiveProduction = async (productionId) => {
    if (!productionId) return;

    const { data, error } = await supabase
      .from("productions")
      .update({ status: "archived" })
      .eq("id", productionId)
      .select("id, name, status, start_date, end_date, created_by, created_at")
      .single();

    if (error) throw error;

    setProductions((prev) =>
      prev.map((p) => (p.id === productionId ? data : p)),
    );

    // If this was the active production, switch back to General
    if (activeProductionId === productionId) {
      setActiveProductionId(null);
    }
  };

  const deleteProduction = async (productionId) => {
    if (!productionId) return;

    const { error } = await supabase
      .from("productions")
      .delete()
      .eq("id", productionId);

    if (error) throw error;

    setProductions((prev) => prev.filter((p) => p.id !== productionId));

    if (activeProductionId === productionId) {
      setActiveProductionId(null);
    }
  };

  const activeProduction =
    productions.find((p) => p.id === activeProductionId) ?? null;

  return (
    <ProductionContext.Provider
      value={{
        productions,
        activeProductionId,
        activeProduction,
        loadingProductions,
        setActiveProductionId,
        createProduction,
        archiveProduction,
        deleteProduction,
        refreshProductions: loadProductions,
      }}
    >
      {children}
    </ProductionContext.Provider>
  );
};

export default ProductionProvider;
