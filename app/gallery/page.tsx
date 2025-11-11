import MediaGallery from '@/components/gallery/MediaGallery';

export const metadata = {
  title: 'Gallery - Gemini Playground',
  description: 'Browse all generated images and videos in one place.',
};

export default function GalleryPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <MediaGallery />
    </div>
  );
}
