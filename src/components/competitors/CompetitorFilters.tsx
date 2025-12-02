import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

export type SortOption = 
  | 'recent-desc'
  | 'recent-asc'
  | 'likes-desc'
  | 'likes-asc'
  | 'views-desc'
  | 'views-asc'
  | 'engagement-desc'
  | 'engagement-asc';

interface CompetitorFiltersProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  totalPosts: number;
}

export const CompetitorFilters = ({ sortBy, onSortChange, totalPosts }: CompetitorFiltersProps) => {
  const sortOptions: { value: SortOption; label: string; icon: string }[] = [
    { value: 'recent-desc', label: 'Newest First', icon: '🗓️' },
    { value: 'recent-asc', label: 'Oldest First', icon: '🗓️' },
    { value: 'likes-desc', label: 'Most Liked', icon: '❤️' },
    { value: 'likes-asc', label: 'Least Liked', icon: '❤️' },
    { value: 'views-desc', label: 'Most Viewed', icon: '👁️' },
    { value: 'views-asc', label: 'Least Viewed', icon: '👁️' },
    { value: 'engagement-desc', label: 'Highest Engagement', icon: '📊' },
    { value: 'engagement-asc', label: 'Lowest Engagement', icon: '📊' },
  ];

  const currentSort = sortOptions.find(opt => opt.value === sortBy) || sortOptions[0];

  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Sort by:</span>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-w-[240px] justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{currentSort.icon}</span>
                <span>{currentSort.label}</span>
              </div>
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px]">
            {sortOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => onSortChange(option.value)}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{option.icon}</span>
                  <span>{option.label}</span>
                </div>
                {sortBy === option.value && (
                  <span className="ml-auto">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="font-medium">{totalPosts}</span> posts
      </div>
    </div>
  );
};
