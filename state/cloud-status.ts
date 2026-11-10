import { getCloudStatus, onCloudStatus, type CloudStatus } from "@/services/cloud/cloud-store";
import { useEffect, useState } from "react";

/** Whether changes are still being saved to the cloud, and whether saving is failing. */
export function useCloudStatus(): CloudStatus {
  const [status, setStatus] = useState<CloudStatus>(getCloudStatus);
  useEffect(() => onCloudStatus(setStatus), []);
  return status;
}
