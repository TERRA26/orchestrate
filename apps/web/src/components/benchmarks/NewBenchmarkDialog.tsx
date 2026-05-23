// FILE: NewBenchmarkDialog.tsx
// Purpose: Collect name, prompt, expected output, and model for a new benchmark run.
// Layer: Benchmarks route surface

import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";

interface NewBenchmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; prompt: string; expected: string; model: string }) => void;
}

export default function NewBenchmarkDialog({
  open,
  onOpenChange,
  onCreate,
}: NewBenchmarkDialogProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [expected, setExpected] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setPrompt("");
      setExpected("");
      setModel("");
    }
  }, [open]);

  const canCreate = prompt.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New benchmark</DialogTitle>
          <DialogDescription>
            Save a prompt, expected answer, and target model. You can run it in any orchestrator
            thread and record the output here.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Name (optional)</p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. web_of_lies — 3 person chain"
              nativeInput
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Prompt</p>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Paste the prompt you want to benchmark"
              size="lg"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Expected answer (optional — used for substring scoring)
            </p>
            <Textarea
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              placeholder="e.g. no, yes, yes"
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Model (optional — free-form)
            </p>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="e.g. claude-opus-4-7"
              nativeInput
            />
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canCreate}
            onClick={() =>
              onCreate({
                name: name.trim(),
                prompt: prompt.trim(),
                expected: expected.trim(),
                model: model.trim(),
              })
            }
          >
            Create benchmark
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
