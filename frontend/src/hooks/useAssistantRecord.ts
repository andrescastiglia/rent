"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  ASSISTANT_GUIDANCE_EVENT,
  pendingAssistantGuidance,
  type AiUiAction,
} from "@/lib/assistant-guidance";

// List pagination does not prevent an assistant request from opening a record.
// The normal authorized API loads the original data; callbacks only open UI.
export function useAssistantRecord<T>(
  load: (id: string) => Promise<T>,
  open: (record: T, action: AiUiAction) => void,
) {
  const pathname = usePathname();
  const handlers = useRef({ load, open });
  handlers.current = { load, open };
  useEffect(() => {
    let active = true;
    let requested: string | undefined;
    const receive = () => {
      const action = pendingAssistantGuidance(pathname);
      if (
        action?.intent !== "edit" ||
        !action.recordId ||
        action.recordId === requested
      )
        return;
      requested = action.recordId;
      handlers.current
        .load(action.recordId)
        .then((record) => {
          if (active && requested === action.recordId)
            handlers.current.open(record, action);
        })
        .catch(() => {
          requested = undefined;
        });
    };
    receive();
    window.addEventListener(ASSISTANT_GUIDANCE_EVENT, receive);
    return () => {
      active = false;
      window.removeEventListener(ASSISTANT_GUIDANCE_EVENT, receive);
    };
  }, [pathname]);
}
