import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaginationInfo } from '../utils/api';

interface PaginationControlsProps {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  compact?: boolean;
  isLoading?: boolean;
}

export function PaginationControls({ pagination, onPageChange, compact = false, isLoading = false }: PaginationControlsProps) {
  const { page, totalPages, hasNext, hasPrev, total } = pagination;

  if (totalPages <= 1) {
    return null;
  }

  // Generate page numbers to display
  const getPageNumbers = () => {
    if (compact) return [page];
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      // Calculate range around current page
      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);

      // Adjust range if at the start or end
      if (page <= 2) {
        end = Math.min(totalPages - 1, 3);
      }
      if (page >= totalPages - 1) {
        start = Math.max(2, totalPages - 2);
      }

      // Add ellipsis before range if needed
      if (start > 2) {
        pages.push('...');
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      // Add ellipsis after range if needed
      if (end < totalPages - 1) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-between gap-2 py-3 px-2">
      {/* Info text */}
      {!compact && (
        <div className="text-xs text-gray-500">
          Mostrando {Math.min((page - 1) * pagination.limit + 1, total)} - {Math.min(page * pagination.limit, total)} de {total}
        </div>
      )}

      {/* Page navigation */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Previous button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev || isLoading}
          aria-label="Página anterior"
          className={`h-8 w-8 p-0 ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((pageNum, index) => {
            if (pageNum === '...') {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                  ...
                </span>
              );
            }

            const isActive = pageNum === page;

            return (
              <Button
                key={pageNum}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(pageNum as number)}
                disabled={isLoading}
                aria-label={`Página ${pageNum}`}
                aria-current={isActive ? 'page' : undefined}
                className={`h-8 w-8 p-0 ${isActive
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'hover:bg-gray-100'
                  } ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        {/* Next button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext || isLoading}
          aria-label="Página siguiente"
          className={`h-8 w-8 p-0 ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
