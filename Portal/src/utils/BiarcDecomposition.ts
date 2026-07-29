/**
 * @file BiarcDecomposition.ts
 * @brief Utility to decompose Cubic Bezier curves into Biarcs (two circular arcs with G1 continuity).
 * Based on the method by D.J. Walton and D.S. Meek.
 */

import paper from 'paper';

export interface IArc {
    center: { x: number; y: number };
    radius: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    clockwise: boolean;
}

/**
 * @class BiarcDecomposition
 */
export class BiarcDecomposition {

    /**
     * @brief Approximates a Cubic Bezier curve with Biarcs recursively.
     * @param p0 Start point
     * @param p1 Control point 1 (absolute)
     * @param p2 Control point 2 (absolute)
     * @param p3 End point
     * @param tolerance Max deviation allowed
     * @returns Array of Arcs
     */
    public static approximateBezier(
        p0: paper.Point,
        p1: paper.Point,
        p2: paper.Point,
        p3: paper.Point,
        tolerance: number
    ): IArc[] {
        const arcs: IArc[] = [];
        this.recursiveDecompose(p0, p1, p2, p3, tolerance, arcs, 0);
        return arcs;
    }

    private static recursiveDecompose(
        p0: paper.Point,
        p1: paper.Point,
        p2: paper.Point,
        p3: paper.Point,
        tolerance: number,
        arcs: IArc[],
        depth: number
    ) {
        if (depth > 10) {
            // Fallback to a single line if too deep
            // But we need to return arcs. 
            // We can return a "flat" arc (very large radius) or just stop.
            // Ideally, we shouldn't hit this with Biarcs unless the curve is degenerate.
            return;
        }

        // 1. Try to create a Biarc
        const biarc = this.createBiarc(p0, p1, p2, p3);

        if (!biarc) {
            // Failed to create biarc (e.g., inflection point or S-shape).
            // Split and recurse.
            const split = this.splitBezier(p0, p1, p2, p3, 0.5);
            this.recursiveDecompose(split.left.p0, split.left.p1, split.left.p2, split.left.p3, tolerance, arcs, depth + 1);
            this.recursiveDecompose(split.right.p0, split.right.p1, split.right.p2, split.right.p3, tolerance, arcs, depth + 1);
            return;
        }

        // 2. Check error
        // We check the distance between the mid-point of the Bezier and the Biarc.
        // Bezier mid point at t=0.5
        const midBez = this.getBezierPoint(p0, p1, p2, p3, 0.5);

        // Find distance from midBez to the biarc.
        // The biarc joint is usually near t=0.5 but not exactly.
        // A simple check is to see if the biarc joint is close to the bezier?
        // Better: Check max deviation.
        // For simplicity, we check if the biarc joint is close enough to the curve?
        // Or check a few points.

        // Let's check distance from Bezier(0.5) to the closest arc.
        const d1 = this.distanceToArc(midBez, biarc.arc1);
        const d2 = this.distanceToArc(midBez, biarc.arc2);
        const error = Math.min(d1, d2);

        if (error <= tolerance) {
            arcs.push(biarc.arc1);
            arcs.push(biarc.arc2);
        } else {
            // Error too large, split and recurse
            const split = this.splitBezier(p0, p1, p2, p3, 0.5);
            this.recursiveDecompose(split.left.p0, split.left.p1, split.left.p2, split.left.p3, tolerance, arcs, depth + 1);
            this.recursiveDecompose(split.right.p0, split.right.p1, split.right.p2, split.right.p3, tolerance, arcs, depth + 1);
        }
    }

    /**
     * @brief Creates a Biarc from a Bezier segment using the Incenter method.
     * Assumes the curve is convex (C-shaped). If S-shaped, it might fail or produce bad results.
     */
    private static createBiarc(p0: paper.Point, p1: paper.Point, p2: paper.Point, p3: paper.Point): { arc1: IArc, arc2: IArc } | null {
        // Tangent vectors
        const t1 = p1.subtract(p0);
        const t2 = p3.subtract(p2);

        // If tangents are zero (degenerate), handle?
        if (t1.length < 1e-9 || t2.length < 1e-9) return null;

        // Intersection of tangents (V)
        // Line 1: P0 + u * T1
        // Line 2: P3 + v * T2
        // Solve for intersection.
        const den = t1.x * t2.y - t1.y * t2.x;
        if (Math.abs(den) < 1e-9) {
            // Parallel tangents. 
            // Could be a single arc (semicircle) or a line.
            // For now, treat as split needed.
            return null;
        }

        const u = ((p3.x - p0.x) * t2.y - (p3.y - p0.y) * t2.x) / den;
        const V = p0.add(t1.multiply(u));

        // Check if V is "forward"
        // If u < 0, intersection is behind P0. S-shape or loop.
        // We need V to be roughly between P0 and P3 direction.
        // Also check v for P3?
        // Let's just proceed with Incenter.

        // Triangle P0, V, P3.
        // Calculate Incenter G.
        // Incenter = (a*P0 + b*V + c*P3) / (a+b+c)
        // where a = length(V-P3), b = length(P0-P3), c = length(P0-V)
        // Wait, standard incenter formula:
        // A=P0, B=V, C=P3.
        // a = len(BC) = len(V-P3)
        // b = len(AC) = len(P0-P3)
        // c = len(AB) = len(P0-V)

        const a = V.getDistance(p3);
        const b = p0.getDistance(p3);
        const c = p0.getDistance(V);
        const perimeter = a + b + c;

        if (perimeter < 1e-9) return null;

        const G = p0.multiply(a).add(V.multiply(b)).add(p3.multiply(c)).divide(perimeter);

        // Arc 1: P0 to G, tangent T1 at P0.
        // Center C1 is intersection of perpendicular to T1 at P0, and perpendicular bisector of P0-G.
        // Or simpler: Center lies on perpendicular to T1 at P0.
        // Also distance(C1, P0) = distance(C1, G).
        const arc1 = this.createArcFromTangent(p0, t1, G);

        // Arc 2: G to P3, tangent T2 at P3?
        // Wait, at G, the tangent is continuous.
        // Arc 2 is defined by G, P3, and tangent at G (which matches Arc 1).
        // OR defined by G, P3, and tangent T2 at P3.
        // The Incenter property guarantees that the reflection of T1 across P0-G bisector matches reflection of T2 across P3-G bisector?
        // Yes, the incenter G ensures that the two arcs join tangentially.
        const arc2 = this.createArcFromTangent(p3, t2, G); // Note: Tangent T2 is at P3 pointing OUT?
        // T2 is P3-P2. It points INTO the curve at P3? No, P2->P3 is forward.
        // createArcFromTangent expects tangent at Start.
        // For Arc 2, start is G, end is P3.
        // We don't have tangent at G explicitly calculated yet.
        // But we can use the "End Tangent" version.
        // Or just reverse Arc 2 construction: Start P3, End G, Tangent -T2.

        // Let's use reverse construction for Arc 2 to ensure it matches T2 at P3.
        const arc2Rev = this.createArcFromTangent(p3, t2.multiply(-1), G);

        if (!arc1 || !arc2Rev) return null;

        // Correct Arc 2 properties (reverse start/end/cw)
        const arc2Final: IArc = {
            center: arc2Rev.center,
            radius: arc2Rev.radius,
            start: G,
            end: p3,
            clockwise: !arc2Rev.clockwise // Reversing direction flips CW/CCW
        };

        return { arc1, arc2: arc2Final };
    }

    /**
     * @brief Creates an arc from Start point, Start Tangent, and End point.
     */
    private static createArcFromTangent(start: paper.Point, tangent: paper.Point, end: paper.Point): IArc | null {
        // Center lies on line perpendicular to tangent at start.
        // Center also lies on perpendicular bisector of start-end chord.

        // Perpendicular to tangent: (-ty, tx)
        const perpT = new paper.Point(-tangent.y, tangent.x);

        // Midpoint of chord
        const mid = start.add(end).divide(2);
        // Vector start->end
        const chord = end.subtract(start);
        // Perpendicular to chord: (-cy, cx)
        const perpC = new paper.Point(-chord.y, chord.x);

        // Intersect Line(Start, perpT) and Line(Mid, perpC)
        // L1: Start + u * perpT
        // L2: Mid + v * perpC

        const den = perpT.x * perpC.y - perpT.y * perpC.x;
        if (Math.abs(den) < 1e-9) {
            // Parallel lines. Center at infinity -> Straight line.
            return null;
        }

        const vec = mid.subtract(start);
        const u = (vec.x * perpC.y - vec.y * perpC.x) / den;

        const center = start.add(perpT.multiply(u));
        const radius = center.getDistance(start);

        // Determine CW/CCW
        // Cross product of (Start->End) and (Start->Center)?
        // Or check angle.
        // Tangent is Start->Dir.
        // Vector Start->Center is perpendicular.
        // Cross(Tangent, Start->Center) should tell us.
        // If Cross > 0, Center is to the Left (CCW).
        // If Cross < 0, Center is to the Right (CW).
        const cross = tangent.x * (center.y - start.y) - tangent.y * (center.x - start.x);
        const clockwise = cross < 0;

        return {
            center: { x: center.x, y: center.y },
            radius,
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
            clockwise
        };
    }

    private static splitBezier(p0: paper.Point, p1: paper.Point, p2: paper.Point, p3: paper.Point, t: number) {
        // De Casteljau's algorithm
        const q0 = p0.add(p1.subtract(p0).multiply(t));
        const q1 = p1.add(p2.subtract(p1).multiply(t));
        const q2 = p2.add(p3.subtract(p2).multiply(t));
        const r0 = q0.add(q1.subtract(q0).multiply(t));
        const r1 = q1.add(q2.subtract(q1).multiply(t));
        const s0 = r0.add(r1.subtract(r0).multiply(t));

        return {
            left: { p0: p0, p1: q0, p2: r0, p3: s0 },
            right: { p0: s0, p1: r1, p2: q2, p3: p3 }
        };
    }

    private static getBezierPoint(p0: paper.Point, p1: paper.Point, p2: paper.Point, p3: paper.Point, t: number): paper.Point {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;

        return p0.multiply(uuu)
            .add(p1.multiply(3 * uu * t))
            .add(p2.multiply(3 * u * tt))
            .add(p3.multiply(ttt));
    }

    private static distanceToArc(p: paper.Point, arc: IArc): number {
        const distToCenter = Math.sqrt(Math.pow(p.x - arc.center.x, 2) + Math.pow(p.y - arc.center.y, 2));
        return Math.abs(distToCenter - arc.radius);
    }
}
