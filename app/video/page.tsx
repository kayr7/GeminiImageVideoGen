import VideoGenerator from '@/components/generators/VideoGenerator';

export const metadata = {
  title: 'Video Generation - Gemini Playground',
  description: 'Generate videos with Google Gemini AI',
};

export default function VideoPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <VideoGenerator />
    </div>
  );
}

