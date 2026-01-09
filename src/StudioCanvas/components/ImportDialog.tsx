import React, { useRef } from 'react';
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
import { Upload } from 'lucide-react';
import { useStudioStore } from '../stores/useStudioStore';

export function ImportDialog() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setNodes, setEdges } = useStudioStore();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.nodes) setNodes(json.nodes);
        if (json.edges) setEdges(json.edges);
      } catch (error) {
        console.error('Failed to parse JSON', error);
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4 mr-2" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Import Flow</DialogTitle>
          <DialogDescription>
            Load a workflow from a JSON file.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
           <div className="grid w-full max-w-sm items-center gap-1.5">
             <Label htmlFor="json">File</Label>
             <Input 
               id="json" 
               type="file" 
               accept=".json" 
               ref={fileInputRef}
               onChange={handleFileChange}
             />
           </div>
        </div>
        <DialogFooter>
          {/* DialogFooter usually has action buttons, but we handle onChange */}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
