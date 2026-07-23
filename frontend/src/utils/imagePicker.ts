import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";
import { api } from "@/src/api/client";

export type PickedImage = {
    uri: string;
    base64: string;
    contentType: string;
};

async function ensureGalleryPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.granted) return true;
    if (res.canAskAgain) return false; // denied once — may ask again later on user intent
  }
  Alert.alert(
    "Photos access needed",
    "Huni needs access to your photos to attach images to posts and comments. Enable it in Settings.",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ]
  );
  return false;
}

export async function pickImages(max: number): Promise<PickedImage[]> {
  if (max <= 0) return [];
  const ok = await ensureGalleryPermission();
  if (!ok) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: max > 1,
    selectionLimit: max,
    quality: 1,
  });
  if (res.canceled) return [];
  const out: PickedImage[] = [];
  for (const asset of res.assets.slice(0, max)) {
    const actions = asset.width && asset.width > 1080 ? [{ resize: { width: 1080 } }] : [];
    const isPng =
    asset.fileName?.toLowerCase().endsWith(".png") ??
    asset.mimeType === "image/png";

    const m = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: isPng ? 1 : 0.7,
        format: isPng
            ? ImageManipulator.SaveFormat.PNG
            : ImageManipulator.SaveFormat.JPEG,
        base64: true,
    });
    if (m.base64) {
      out.push({
          uri: m.uri,
          base64: m.base64,
          contentType: isPng ? "image/png" : "image/jpeg",
      });
    }
  }
  return out;
}

/** Uploads sequentially, returns image ids. Throws on failure. */
export async function uploadImages(images: PickedImage[]): Promise<string[]> {
  const ids: string[] = [];
  for (const img of images) {
    const r = await api.post<{ id: string }>("/uploads", { data: img.base64, content_type: img.contentType });
    ids.push(r.id);
  }
  return ids;
}
