import type { PhotoCollectionTask } from '../shared/photo-collection';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ItineraryStop } from '../shared/itinerary-map';
import type { Journey } from '../shared/types';
import type { NotebookDocument } from '../shared/notebook-documents';
import { linkedNotebookStops } from '../shared/place-notebook-links';

const PlaceDetailsContext = createContext<{
  journey?: Journey;
  documents: NotebookDocument[];
  error: string;
  onOpenDocument?: (name: string) => void;
  onFindPhotos?: (stop: ItineraryStop) => void;
  photoCollections?: Record<string, PhotoCollectionTask>;
  assistantBusy?: boolean;
}>({ documents: [], error: '' });
export const usePlaceDetails = () => useContext(PlaceDetailsContext);
export { linkedNotebookStops };

export function PlaceDetailsProvider({
  journey,
  scratchMarkdown = '',
  onOpenDocument,
  onFindPhotos,
  photoCollections,
  assistantBusy,
  children,
}: {
  journey: Journey;
  scratchMarkdown?: string;
  onOpenDocument?: (name: string) => void;
  onFindPhotos?: (stop: ItineraryStop) => void;
  photoCollections?: Record<string, PhotoCollectionTask>;
  assistantBusy?: boolean;
  children: ReactNode;
}) {
  const [documents, setDocuments] = useState<NotebookDocument[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = async () => {
      const token = ++generation;
      try {
        const files = await window.vitrip.listDocuments(journey.id);
        const values = await Promise.all(
          files.map((file) => window.vitrip.readDocument(journey.id, file.name)),
        );
        if (active && generation === token) {
          setDocuments(values);
          setError('');
        }
      } catch {
        if (active && generation === token) {
          setDocuments([]);
          setError('关联笔记加载失败，请重新打开行程。');
        }
      }
    };
    setDocuments([]);
    void refresh();
    const unsubscribe = window.vitrip.onEvent((event) => {
      if (event.type === 'documents' && event.journeyId === journey.id) void refresh();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [journey.id]);
  return (
    <PlaceDetailsContext.Provider
      value={{
        journey,
        documents: scratchMarkdown
          ? [...documents, { name: '', markdown: scratchMarkdown, revision: '', updatedAt: 0 }]
          : documents,
        error,
        onOpenDocument,
        onFindPhotos,
        photoCollections,
        assistantBusy,
      }}
    >
      {children}
    </PlaceDetailsContext.Provider>
  );
}
