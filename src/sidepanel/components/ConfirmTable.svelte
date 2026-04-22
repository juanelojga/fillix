<script lang="ts">
  import type { FieldFill } from '../../types';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '$components/ui/table';
  import { Input } from '$components/ui/input';

  let { fields }: { fields: FieldFill[] } = $props();
</script>

<div class="overflow-x-auto rounded-md border border-border">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead class="w-1/4">Field</TableHead>
        <TableHead class="w-1/3">Current value</TableHead>
        <TableHead>Proposed value</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each fields as field (field.fieldId)}
        <TableRow>
          <TableCell class="font-medium text-sm">{field.label}</TableCell>
          <TableCell class="text-sm text-muted-foreground">{field.currentValue || '—'}</TableCell>
          <TableCell>
            <Input
              value={field.editedValue ?? field.proposedValue}
              oninput={(e) => {
                field.editedValue = (e.currentTarget as HTMLInputElement).value;
              }}
              class="h-7 text-sm"
            />
          </TableCell>
        </TableRow>
      {/each}
    </TableBody>
  </Table>
</div>
