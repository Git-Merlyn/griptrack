import { useContext, useState } from "react";
import EquipmentContext from "../context/EquipmentContext";
import UserContext from "../context/UserContext";

const EquipmentForm = () => {
  const { addEquipment } = useContext(EquipmentContext);
  const { user } = useContext(UserContext);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("Available");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!user) return;
    addEquipment({ name, location, status, updatedBy: user.username });
    setName("");
    setLocation("");
    setStatus("Available");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface p-6 rounded-xl flex flex-col sm:flex-row gap-4 items-center"
    >
      <h2 className="w-full text-center text-xl font-semibold text-accent sm:w-auto">
        Add New Equipment
      </h2>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full sm:w-48 h-10 px-3 rounded bg-white text-gray-800 placeholder-gray-500"
        required
      />

      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location"
        className="w-full sm:w-48 h-10 px-3 rounded bg-white text-gray-800 placeholder-gray-500"
        required
      />

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-full sm:w-48 h-10 px-3 rounded bg-white text-gray-800"
      >
        <option>Available</option>
        <option>Out</option>
        <option>Damaged</option>
      </select>

      <button
        type="submit"
        className="bg-accent text-text px-4 h-10 rounded hover:brightness-110"
      >
        Add
      </button>
    </form>
  );
};

export default EquipmentForm;
