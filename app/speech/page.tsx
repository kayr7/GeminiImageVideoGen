import SpeechGenerator from '@/components/generators/SpeechGenerator';

export default function SpeechPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Speech Generation
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Convert text to lifelike speech using Google&apos;s Gemini models.
        </p>
      </div>
      
      <SpeechGenerator />
    </div>
  );
}
