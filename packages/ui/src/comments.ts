import type { Comment } from "@icg/shared";

export type CommentsState = { comments: Comment[]; selectedId: string | null };

export type CommentsAction =
  | { type: "add"; comments: Comment[]; select?: boolean }
  | { type: "update"; comment: Comment }
  | { type: "remove"; id: string }
  | { type: "select"; id: string }
  | { type: "clear" };

export const EMPTY_COMMENTS: CommentsState = { comments: [], selectedId: null };

export function commentsReducer(state: CommentsState, action: CommentsAction): CommentsState {
  switch (action.type) {
    case "add": {
      const comments = [...state.comments, ...action.comments];
      const first = action.comments[0];
      const selectedId =
        action.select && first ? first.id : (state.selectedId ?? first?.id ?? null);
      return { comments, selectedId };
    }
    case "update":
      return {
        ...state,
        comments: state.comments.map((c) => (c.id === action.comment.id ? action.comment : c)),
      };
    case "remove": {
      const comments = state.comments.filter((c) => c.id !== action.id);
      const selectedId =
        state.selectedId === action.id ? (comments[0]?.id ?? null) : state.selectedId;
      return { comments, selectedId };
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "clear":
      return EMPTY_COMMENTS;
  }
}

export function selectedComment(state: CommentsState): Comment | null {
  return state.comments.find((c) => c.id === state.selectedId) ?? state.comments[0] ?? null;
}
