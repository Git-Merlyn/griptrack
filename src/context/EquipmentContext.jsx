import { createContext, useState, useEffect } from "react";
import { apiFetchLocations } from "../api/client";

const EquipmentContext = createContext();

export const EquipmentProvider = ({ children }) => {
  const [equipmentData, setEquipmentData] = useState([]);
  const [locations, setLocations] = useState([]);
  const [uploadedPDFItems, setUploadedPDFItems] = useState([]);
  const [pdfUploadModalOpen, setPdfUploadModalOpen] = useState(false);
  const [pdfParsingStatus, setPdfParsingStatus] = useState("idle");
  const [reviewTableVisible, setReviewTableVisible] = useState(false);
  const [assignAllLocation, setAssignAllLocation] = useState("");
  const [importSummaryMessage, setImportSummaryMessage] = useState("");

  // Load saved data from localStorage when app starts
  useEffect(() => {
    const savedEquipment = localStorage.getItem("equipmentData");
    if (savedEquipment) {
      setEquipmentData(JSON.parse(savedEquipment));
    }
  }, []);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const data = await apiFetchLocations();
        setLocations(data); // store full location rows
      } catch (err) {
        console.error("Failed to load locations", err);
      }
    };

    loadLocations();
  }, []);

  // Save equipment data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("equipmentData", JSON.stringify(equipmentData));
  }, [equipmentData]);

  const mergeUploadedPDFItems = () => {
    setEquipmentData((prevData) => {
      const updatedData = [...prevData];

      uploadedPDFItems.forEach((newItem) => {
        const existingIndex = updatedData.findIndex(
          (item) =>
            item.name === newItem.name &&
            item.location === newItem.location &&
            item.startDate === newItem.startDate &&
            item.endDate === newItem.endDate
        );

        if (existingIndex !== -1) {
          updatedData[existingIndex] = {
            ...updatedData[existingIndex],
            quantity:
              parseInt(updatedData[existingIndex].quantity) +
              parseInt(newItem.quantity),
          };
        } else {
          updatedData.push(newItem);
        }
      });

      return updatedData;
    });

    // Reset uploaded items and show confirmation
    setUploadedPDFItems([]);
    setReviewTableVisible(false);
    setImportSummaryMessage(
      `${uploadedPDFItems.length} items added to inventory.`
    );
  };

  return (
    <EquipmentContext.Provider
      value={{
        equipmentData,
        setEquipmentData,
        locations,
        setLocations,
        uploadedPDFItems,
        setUploadedPDFItems,
        pdfUploadModalOpen,
        setPdfUploadModalOpen,
        pdfParsingStatus,
        setPdfParsingStatus,
        reviewTableVisible,
        setReviewTableVisible,
        assignAllLocation,
        setAssignAllLocation,
        importSummaryMessage,
        setImportSummaryMessage,
        mergeUploadedPDFItems,
      }}
    >
      {children}
    </EquipmentContext.Provider>
  );
};

export default EquipmentContext;
