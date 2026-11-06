// Photos are copied into the app's own documents folder so they survive until they've been
// uploaded (the camera's temporary files can be cleared by the phone at any time).
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

export async function keepPhoto(uri) {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const ext = /\.png$/i.test(uri) ? 'png' : 'jpg';
    const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    await new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}
