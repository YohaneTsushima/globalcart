import { toast } from "sonner";

export function persistentToastError(message) {
  return toast.error(message, {
    duration: 100000000,
    style: { 
      width: 'auto', 
      maxWidth: '2600px', 
      whiteSpace: 'pre-wrap' 
    },
    action: (
      <button
        style={{
          all: 'unset',
          cursor: 'pointer',
          color: '#9ca3af',
          fontSize: '12px',
          lineHeight: 1,
          padding: '0 4px',
          marginLeft: '16px',
        }}
        onClick={() => toast.dismiss()}
        aria-label="关闭"
      >
        ✕
      </button>
    ),
  });
}
