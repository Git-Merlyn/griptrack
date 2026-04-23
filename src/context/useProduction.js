import { useContext } from "react";
import ProductionContext from "./ProductionContext";

export default function useProduction() {
  return useContext(ProductionContext);
}
