import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Edit } from "lucide-react";

interface SectionCardProps {
  section: any;
  canEdit: boolean;
  onEdit: () => void;
}

export function SectionCard({ section, canEdit, onEdit }: SectionCardProps) {
  const getYouTubeEmbedUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      let videoId = "";
      
      if (urlObj.hostname.includes("youtube.com")) {
        videoId = urlObj.searchParams.get("v") || "";
      } else if (urlObj.hostname.includes("youtu.be")) {
        videoId = urlObj.pathname.slice(1);
      }
      
      return `https://www.youtube.com/embed/${videoId}`;
    } catch {
      return "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{section.title}</CardTitle>
          {canEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {section.content_type === "text" && section.content && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="whitespace-pre-wrap">{section.content}</p>
          </div>
        )}
        
        {section.content_type === "video" && section.video_url && (
          <div className="aspect-video w-full">
            <iframe
              className="w-full h-full rounded-lg"
              src={getYouTubeEmbedUrl(section.video_url)}
              title={section.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        
        {section.content_type === "image" && section.image_url && (
          <div className="w-full">
            <img
              src={section.image_url}
              alt={section.title}
              className="w-full rounded-lg object-cover"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
