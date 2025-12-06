import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Trash2, 
  Eye, 
  Instagram
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CompetitorService } from '@/services/competitorService';
import type { CompetitorInfo } from '@/types/competitor-types';

interface CompetitorsListProps {
  onViewCompetitor: (username: string) => void;
  instagramBusinessAccountId: string;
}

export const CompetitorsList = ({ onViewCompetitor, instagramBusinessAccountId }: CompetitorsListProps) => {
  const [competitors, setCompetitors] = useState<CompetitorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  
  const { toast } = useToast();

  const loadCompetitors = useCallback(async () => {
    if (!instagramBusinessAccountId) return;
    
    try {
      setIsLoading(true);
      const data = await CompetitorService.getUserCompetitors(instagramBusinessAccountId);
      setCompetitors(data);
    } catch (error) {
      console.error('Error loading competitors:', error);
      toast({
        title: 'Error',
        description: 'Failed to load competitors list',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [instagramBusinessAccountId, toast]);

  useEffect(() => {
    if (instagramBusinessAccountId) {
      loadCompetitors();
    }
  }, [instagramBusinessAccountId, loadCompetitors]);

  const handleRemoveCompetitor = async (username: string) => {
    if (!instagramBusinessAccountId) return;
    
    try {
      setRemovingId(username);
      await CompetitorService.removeCompetitor(username, instagramBusinessAccountId);
      
      toast({
        title: 'Competitor Removed',
        description: `@${username} has been removed from your list`,
      });
      
      await loadCompetitors();
    } catch (error) {
      console.error('Error removing competitor:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove competitor',
        variant: 'destructive',
      });
    } finally {
      setRemovingId(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never updated';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Updated today';
    if (diffDays === 1) return 'Updated yesterday';
    if (diffDays < 7) return `Updated ${diffDays} days ago`;
    if (diffDays < 30) return `Updated ${Math.floor(diffDays / 7)} weeks ago`;
    return `Updated ${date.toLocaleDateString()}`;
  };

  return (
    <div className="space-y-4">
      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && competitors.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Instagram className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Competitors Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Add Instagram accounts above to start tracking their content and performance
            </p>
          </CardContent>
        </Card>
      )}

      {/* Competitors List - Horizontal Cards */}
      {!isLoading && competitors.length > 0 && (
        <div className="space-y-2">
          {competitors.map((competitor) => (
            <Card 
              key={competitor.ig_user_id} 
              className="overflow-hidden hover:shadow-md transition-all cursor-pointer group"
              onClick={() => onViewCompetitor(competitor.username)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Profile Pic */}
                  {competitor.profile_pic_url ? (
                    <Image
                      src={CompetitorService.getProxiedImageUrl(competitor.profile_pic_url)}
                      alt={competitor.username}
                      width={48}
                      height={48}
                      unoptimized
                      className="w-12 h-12 rounded-full bg-muted flex-shrink-0"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.src = CompetitorService.getPlaceholderImage();
                        target.onerror = null;
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Instagram className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">@{competitor.username}</h3>
                      {competitor.verified && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">✓</Badge>
                      )}
                    </div>
                    {competitor.biography && (
                      <p className="text-sm text-muted-foreground truncate">
                        {competitor.biography}
                      </p>
                    )}
                  </div>

                  {/* Meta info & Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(competitor.last_scraped_at)}
                      </p>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCompetitor(competitor.username);
                      }}
                      disabled={removingId === competitor.username}
                    >
                      {removingId === competitor.username ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Eye className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
