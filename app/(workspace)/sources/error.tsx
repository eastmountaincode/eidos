"use client";

import { Button } from "@/components/ui/button";

export default function SourcesError({ reset }: { reset: () => void }) {
  return (
    <div className="p-4">
      <p role="alert" className="mb-3 text-sm">
        Sources could not be loaded.
      </p>
      <Button variant="outline" size="sm" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
