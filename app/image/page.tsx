import ImageGenerator from '@/components/generators/ImageGenerator';

export const metadata = {
  title: 'Image Generation - Gemini Playground',
  description: 'Generate stunning images with Google Gemini AI',
};

export default function ImagePage() {
  return (
    <div className="max-w-7xl mx-auto">
      <ImageGenerator />
    </div>
  );
}

