declare module 'imagetracerjs' {
    export interface Options {
        corsenabled?: boolean;
        ltres?: number;
        qtres?: number;
        pathomit?: number;
        rightangleenhance?: boolean;
        colorsampling?: number;
        numberofcolors?: number;
        mincolorratio?: number;
        colorquantcycles?: number;
        layering?: number;
        strokewidth?: number;
        linefilter?: boolean;
        scale?: number;
        roundcoords?: number;
        viewbox?: boolean;
        desc?: boolean;
        lcpr?: number;
        qcpr?: number;
        blurradius?: number;
        blurdelta?: number;
    }

    export function imageToSVG(
        url: string,
        options?: Options | string,
        callback?: (svg: string) => void
    ): void | string;

    export function imagedataToSVG(
        imgd: ImageData,
        options?: Options | string
    ): string;

    export function appendSVGString(svgstr: string, parentid: string): void;
}
