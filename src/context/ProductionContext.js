import { createContext } from "react";

// Shape of the context value — keeps PropTypes-style documentation in one place.
const ProductionContext = createContext({
  productions: [],           // all productions for this org
  activeProductionId: null,  // UUID or null (null = General pool)
  activeProduction: null,    // derived: the full production object, or null
  loadingProductions: true,

  setActiveProductionId: () => {},
  createProduction: async () => {},
  archiveProduction: async () => {},
  deleteProduction: async () => {},
  refreshProductions: async () => {},
});

export default ProductionContext;
