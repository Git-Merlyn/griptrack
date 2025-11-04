import { useContext } from "react";
import EquipmentContext from "../context/EquipmentContext";

const EquipmentTable = () => {
  const { equipment } = useContext(EquipmentContext);

  const statusClass = (status) => {
    switch (status) {
      case "Available":
        return "text-success";
      case "Out":
        return "text-warning";
      case "Damaged":
        return "text-danger";
      default:
        return "text-text";
    }
  };

  return (
    <table className="table-auto w-full text-text">
      <thead>
        <tr className="bg-surface text-left">
          <th className="p-2">Name</th>
          <th className="p-2">Location</th>
          <th className="p-2">Status</th>
          <th className="p-2">Updated By</th>
        </tr>
      </thead>
      <tbody>
        {equipment.map((item) => (
          <tr key={item.id} className="border-t border-gray-700">
            <td className="p-2">{item.name}</td>
            <td className="p-2">{item.location}</td>
            <td className={`p-2 font-semibold ${statusClass(item.status)}`}>
              {item.status}
            </td>
            <td className="p-2">{item.updatedBy}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default EquipmentTable;
