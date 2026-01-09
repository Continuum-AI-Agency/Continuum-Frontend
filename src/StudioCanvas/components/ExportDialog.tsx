import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { useStudioStore } from '../stores/useStudioStore';

export function ExportDialog() {
  const { nodes, edges } = useStudioStore();

  const handleExport = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'continuum-flow.json';
    a.click();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" /> Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Flow</DialogTitle>
          <DialogDescription>
            Save your current workflow as a JSON file.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
           <div className="text-sm text-muted-foreground">
             Ready to export {nodes.length} nodes and {edges.length} connections.
           </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleExport}>Download</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
