import React, { createContext, useContext } from 'react';

type PresenceUser = {
  user_id: string;
  full_name: string;
  avatar_url: string;
  online_at: string;
  email?: string;
  selected_node_ids?: string[];
  color: string;
};

interface PresenceContextValue {
  onlineUsers: PresenceUser[];
  currentUserId: string | undefined;
  remoteCursors: Record<string, { x: number; y: number; name: string; color: string }>;
  updateCursor: (x: number, y: number) => void;
  updatePresence: (nodeIds: string[]) => void;
  status: string;
  isLoading: boolean;
}

const PresenceContext = createContext<PresenceContextValue | undefined>(undefined);

export function PresenceProvider({
  children,
  onlineUsers,
  currentUserId,
  remoteCursors,
  updateCursor,
  updatePresence,
  status,
  isLoading,
}: {
  children: React.ReactNode;
  onlineUsers: PresenceUser[];
  currentUserId: string | undefined;
  remoteCursors: Record<string, { x: number; y: number; name: string; color: string }>;
  updateCursor: (x: number, y: number) => void;
  updatePresence: (nodeIds: string[]) => void;
  status: string;
  isLoading: boolean;
}) {
  return (
    <PresenceContext.Provider
      value={{
        onlineUsers,
        currentUserId,
        remoteCursors,
        updateCursor,
        updatePresence,
        status,
        isLoading,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const context = useContext(PresenceContext);
  if (!context) {
    return {
      onlineUsers: [],
      currentUserId: undefined,
      remoteCursors: {},
      updateCursor: () => {},
      updatePresence: () => {},
      status: "INITIALIZING",
      isLoading: true,
    };
  }
  return context;
}

export function useNodeSelection(nodeId: string) {
  const { onlineUsers, currentUserId } = usePresence();
  
  const selectingUser = onlineUsers.find(
    user => user.user_id !== currentUserId && user.selected_node_ids?.includes(nodeId)
  );
  
  return {
    isSelectedByOther: !!selectingUser,
    selectingUser,
  };
}
