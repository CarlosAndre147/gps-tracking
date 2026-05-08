import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount: number;
  canPrev: boolean;
  canNext: boolean;
  isFetching: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function UsersPagination({ page, pageCount, canPrev, canNext, isFetching, onPrev, onNext }: Props) {
  return (
    <div className="flex items-center justify-between border-t border-layout-border px-4 py-3 text-sm">
      <span className="text-text-secondary">
        Página {page} de {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canPrev || isFetching} onClick={onPrev}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={!canNext || isFetching} onClick={onNext}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
