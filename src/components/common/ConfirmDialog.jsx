import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  confirmClassName = "",
  confirmDisabled = false,
  cancelDisabled = false,
  checkboxLabel = "",
  checkboxChecked = false,
  onCheckboxChange,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {checkboxLabel && (
          <label className="flex items-center gap-2 px-1 -mt-1 cursor-pointer">
            <Checkbox
              checked={checkboxChecked}
              onCheckedChange={(checked) => onCheckboxChange?.(checked)}
            />
            <span className="text-sm text-gray-600">{checkboxLabel}</span>
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={cancelDisabled}
            onClick={onCancel}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmDisabled}
            className={confirmClassName}
            onClick={(e) => onConfirm?.(e)}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
