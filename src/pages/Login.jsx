import { useState, useContext } from "react";
import UserContext from "../context/UserContext";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [username, setUsername] = useState("");
  const { login } = useContext(UserContext);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    login(username);
    navigate("/");
  };

  return (
    <form onSubmit={handleLogin} className="p-6 space-y-4">
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        className="input"
        required
      />
      <button type="submit" className="btn">
        Login
      </button>
    </form>
  );
};

export default Login;
