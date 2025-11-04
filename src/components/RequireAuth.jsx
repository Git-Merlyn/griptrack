import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function RequireAuth({ children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
}
