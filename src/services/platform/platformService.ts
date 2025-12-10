/**
 * Platform detection service
 * Detects whether the app is running in Electron, Mobile WebView, or Browser
 */

export type OS = 'windows' | 'darwin' | 'linux' | 'android' | 'ios' | 'web';

export interface Platform {
    isElectron: boolean;
    isMobile: boolean;
    isWeb: boolean;
    os: OS;
    supportsPdf: boolean;
    supportsFileSystem: boolean;
    supportsNativeMenus: boolean;
}

let cachedPlatform: Platform | null = null;

/**
 * Detect the current platform
 * Note: We don't cache if electronAPI isn't available yet, as it might load later
 */
export function getPlatform(): Platform {
    // Always re-check for Electron in case it loaded after initial check
    // This handles race conditions where React mounts before preload completes
    if (typeof window !== 'undefined' && window.electronAPI) {
        // Update cache if we're in Electron
        if (!cachedPlatform || !cachedPlatform.isElectron) {
            const osMap: Record<string, OS> = {
                'win32': 'windows',
                'darwin': 'darwin',
                'linux': 'linux'
            };

            cachedPlatform = {
                isElectron: true,
                isMobile: false,
                isWeb: false,
                os: osMap[window.electronAPI.platform.os] || 'linux',
                supportsPdf: true,
                supportsFileSystem: true,
                supportsNativeMenus: true
            };
        }
        return cachedPlatform;
    }

    // If we already have a cached non-Electron platform, return it
    if (cachedPlatform) {
        return cachedPlatform;
    }

    // Check for React Native WebView
    if (typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
        const isAndroid = navigator.userAgent.toLowerCase().includes('android');

        cachedPlatform = {
            isElectron: false,
            isMobile: true,
            isWeb: false,
            os: isAndroid ? 'android' : 'ios',
            supportsPdf: false,  // PDF disabled on mobile per requirements
            supportsFileSystem: false,
            supportsNativeMenus: false
        };
        return cachedPlatform;
    }

    // Default to web browser
    cachedPlatform = {
        isElectron: false,
        isMobile: false,
        isWeb: true,
        os: 'web',
        supportsPdf: true,
        supportsFileSystem: 'showDirectoryPicker' in window,
        supportsNativeMenus: false
    };
    return cachedPlatform;
}

/**
 * Reset cached platform (for testing)
 */
export function resetPlatformCache(): void {
    cachedPlatform = null;
}

/**
 * Check if a feature is supported
 */
export function supportsFeature(feature: 'pdf' | 'fileSystem' | 'nativeMenus'): boolean {
    const platform = getPlatform();

    switch (feature) {
        case 'pdf':
            return platform.supportsPdf;
        case 'fileSystem':
            return platform.supportsFileSystem;
        case 'nativeMenus':
            return platform.supportsNativeMenus;
        default:
            return false;
    }
}
