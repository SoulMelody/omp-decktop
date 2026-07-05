import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useStore } from "./store";

export function resolveRouteTarget(routeId: string | undefined, activeId: string | undefined): string | undefined {
	return routeId ?? activeId;
}

export function nextPathForActive(activeId: string | undefined): string {
	return activeId ? `/c/${activeId}` : "/";
}

export function useSessionRoute(): void {
	const { sessionId: routeId } = useParams<{ sessionId?: string }>();
	const navigate = useNavigate();
	const wsReady = useStore((s) => s.ws !== null);
	const activeId = useStore((s) => s.activeId);
	const adoptedRouteRef = useRef(false);

	useEffect(() => {
		if (!wsReady) return;
		const target = resolveRouteTarget(routeId, useStore.getState().activeId);
		adoptedRouteRef.current = true;
		if (target) useStore.getState().selectSession(target);
	}, [routeId, wsReady]);

	useEffect(() => {
		if (!wsReady || !adoptedRouteRef.current) return;
		const current = useStore.getState().activeId;
		if (current === routeId) return;
		navigate(nextPathForActive(current), { replace: true });
	}, [activeId, routeId, wsReady, navigate]);
}
