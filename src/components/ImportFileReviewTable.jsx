import React from "react";

const ImportFileReviewTable = ({
  reviewItems = [],
  locations = [],
  onChangeLocation,
  onSubmit,
}) => {
  const handleLocationChange = (index, newLocation) => {
    if (onChangeLocation) {
      onChangeLocation(index, newLocation);
    }
  };

  return (
    <div className="mt-4">
      <table className="min-w-full table-auto border border-gray-300 rounded">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-4 py-2">Item ID</th>
            <th className="border px-4 py-2">Description</th>
            <th className="border px-4 py-2">Quantity</th>
            <th className="border px-4 py-2">Ship Date</th>
            <th className="border px-4 py-2">Return Date</th>
            <th className="border px-4 py-2">Location</th>
          </tr>
        </thead>
        <tbody>
          {reviewItems.map((item, index) => (
            <tr key={index}>
              <td className="border px-4 py-2">{item.itemCode}</td>
              <td className="border px-4 py-2">{item.description}</td>
              <td className="border px-4 py-2">{item.quantity}</td>
              <td className="border px-4 py-2">{item.shipDate}</td>
              <td className="border px-4 py-2">{item.returnDate}</td>
              <td className="border px-4 py-2">
                <select
                  className="border px-2 py-1 rounded"
                  value={item.location || ""}
                  onChange={(e) => handleLocationChange(index, e.target.value)}
                >
                  <option value="">Select location</option>
                  {locations.map((loc, i) => (
                    <option key={i} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-right">
        <button
          onClick={onSubmit}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Submit
        </button>
      </div>
    </div>
  );
};

export default ImportFileReviewTable;
