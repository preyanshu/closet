import { File, Paths } from "expo-file-system";

const CLEARBACKDROP_API = "https://clearbackdrop.com/api/v1/remove-background";

export type BackgroundRemovalResult = {
  cleanUri: string;
  originalUri: string;
};

export async function removeBackground(imageUri: string): Promise<BackgroundRemovalResult> {
  const formData = new FormData();
  formData.append("image", {
    uri: imageUri,
    type: "image/jpeg",
    name: "photo.jpg",
  } as unknown as Blob);

  const response = await fetch(CLEARBACKDROP_API, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Background removal failed (${response.status}): ${errorText}`);
  }

  const outputBytes = new Uint8Array(await response.arrayBuffer());

  let binary = "";
  for (let i = 0; i < outputBytes.length; i++) {
    binary += String.fromCharCode(outputBytes[i]);
  }
  const base64Data = btoa(binary);

  const filename = `clean-${Date.now()}.png`;
  const outputFile = new File(Paths.document, filename);
  outputFile.write(base64Data, { encoding: "base64" });

  return {
    cleanUri: outputFile.uri,
    originalUri: imageUri,
  };
}
