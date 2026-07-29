/**
 * @file importFile.ts
 * @brief 확장자 기반 통합 파일 Import 디스패처.
 *
 * 사용자는 "Import File" 버튼 하나로 모든 지원 형식을 로드하고,
 * 형식 판별(SVG/DXF/Raster)은 이 디스패처가 담당한다.
 *
 * @pattern Strategy + Dispatcher — 확장자/MIME을 판별해 형식별
 *          Import 전략(importFromSVG / importFromDXF / importImage)으로 위임한다.
 */
import * as fabric from 'fabric';
import { importFromSVG } from '../canvasImportExport';
import { importFromDXF } from './dxfImport';
import { importImage } from './importImage';

/** @brief 통합 파일 입력 accept 목록 (지원 8종 + tif 축약형) */
export const SUPPORTED_IMPORT_ACCEPT = '.svg,.dxf,.png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,.gif';

/** @brief Chromium/UTIF 경로로 처리 가능한 raster 확장자 */
const RASTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif', 'tif', 'tiff'];

export type ImportedFormat = 'svg' | 'dxf' | 'image';

export interface ImportFileResult {
    /** 판별된 형식 */
    format: ImportedFormat;
    /** 캔버스에 추가된 객체 수 */
    count: number;
}

/**
 * @brief 파일 확장자를 판별하여 형식별 Import 전략으로 라우팅한다.
 * @param canvas Fabric 캔버스 인스턴스
 * @param file   사용자가 선택(또는 드롭)한 파일
 * @return 형식 및 추가된 객체 수
 * @throws 미지원 형식이거나 각 전략의 파싱/디코딩 실패 시
 */
export const importFile = async (canvas: fabric.Canvas, file: File): Promise<ImportFileResult> => {
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';

    if (ext === 'svg') {
        const count = await importFromSVG(canvas, file);
        return { format: 'svg', count };
    }

    if (ext === 'dxf') {
        const count = await importFromDXF(canvas, file);
        return { format: 'dxf', count };
    }

    // raster: 알려진 확장자 또는 MIME이 image/* 인 경우 (확장자 없는 이미지 대비)
    if (RASTER_EXTENSIONS.includes(ext) || file.type.startsWith('image/')) {
        const count = await importImage(canvas, file);
        return { format: 'image', count };
    }

    throw new Error(`Unsupported file format: .${ext || '(none)'}`);
};
