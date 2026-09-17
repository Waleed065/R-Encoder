import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert } from 'chai';

/* With codepage('auto') the encoder used to send a code page command for every
   text fragment, also when the printer was already on that page. It now sends
   one only when the page actually changes, which is the same test the explicit
   code page path has always made */

describe('Automatic code page selection', function() {
    const NL = [ 10, 13 ];
    const INITIALIZE = [ 27, 64, 28, 46, 27, 77, 0 ];
    const CP437 = [ 27, 116, 0 ];
    const CP850 = [ 27, 116, 2 ];
    const CP851 = [ 27, 116, 11 ];
    const spaces = (n) => new Array(n).fill(32);

    /* cp437: é = 130, ö = 148, ï = 139, ô = 147 */
    const HELLO = [ 104, 130, 108, 108, 111 ];       /* héllo */
    const WORLD = [ 119, 148, 114, 108, 100 ];       /* wörld */
    const CAFE = [ 99, 97, 102, 130 ];               /* café */
    const NAIVE = [ 110, 97, 139, 118, 101 ];        /* naïve */
    const HOTEL = [ 104, 147, 116, 101, 108 ];       /* hôtel */
    const THE = [ 116, 104, 130 ];                   /* thé */
    const PLAIN = [ 104, 101, 108, 108, 111 ];       /* hello */

    /* cp851: ψυχη */
    const PSYCHE = [ 246, 242, 244, 225 ];

    describe('codepage(auto) with four lines of accented Latin text', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .initialize()
            .codepage('auto')
            .line('héllo')
            .line('wörld')
            .line('café')
            .line('naïve')
            .encode();

        it('should send one code page command before the first line and none before the others', function () {
            assert.deepEqual(new Uint8Array([
                ...INITIALIZE,
                ...CP437, ...HELLO, ...NL,
                ...WORLD, ...NL,
                ...CAFE, ...NL,
                ...NAIVE, ...NL,
            ]), result);
        });
    });

    describe('codepage(auto) with a Greek line, a Latin line and a Greek line', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .initialize()
            .codepage('auto')
            .line('ψυχη')
            .line('hello')
            .line('ψυχη')
            .encode();

        it('should send one code page command per switch', function () {
            assert.deepEqual(new Uint8Array([
                ...INITIALIZE,
                ...CP851, ...PSYCHE, ...NL,
                ...CP437, ...PLAIN, ...NL,
                ...CP851, ...PSYCHE, ...NL,
            ]), result);
        });
    });

    describe('codepage(auto) with bold toggled around fragments', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .initialize()
            .codepage('auto')
            .text('héllo ')
            .bold(true)
            .text('wörld')
            .bold(false)
            .text(' café')
            .newline()
            .encode();

        it('should send one code page command for the whole line', function () {
            assert.deepEqual(new Uint8Array([
                ...INITIALIZE,
                ...CP437, ...HELLO, 32,
                27, 69, 1, ...WORLD, 27, 69, 0,
                32, ...CAFE,
                ...NL,
            ]), result);
        });
    });

    describe('codepage(auto) with a table of accented text', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .initialize()
            .codepage('auto')
            .table(
                [ { width: 16, align: 'left' }, { width: 16, align: 'right' } ],
                [ [ 'café', 'thé' ], [ 'naïve', 'cru' ], [ 'hôtel', 'lit' ] ],
            )
            .encode();

        it('should send one code page command at the first cell and none per row', function () {
            assert.deepEqual(new Uint8Array([
                ...INITIALIZE,
                ...CP437,
                ...CAFE, ...spaces(12), ...spaces(13), ...THE, ...NL,
                ...NAIVE, ...spaces(11), ...spaces(13), 99, 114, 117, ...NL,
                ...HOTEL, ...spaces(11), ...spaces(13), 108, 105, 116, ...NL,
            ]), result);
        });
    });

    describe('codepage(cp850) followed by codepage(auto)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .initialize()
            .codepage('cp850')
            .line('héllo')
            .codepage('auto')
            .line('wörld')
            .encode();

        it('should switch from the explicit page to the automatic one', function () {
            assert.deepEqual(new Uint8Array([
                ...INITIALIZE,
                ...CP850, ...HELLO, ...NL,
                ...CP437, ...WORLD, ...NL,
            ]), result);
        });
    });

    describe('codepage(auto) in a second receipt after encode() and initialize()', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let first = encoder.initialize().codepage('auto').line('héllo').encode();
        let second = encoder.initialize().line('wörld').encode();

        it('should send the code page command again, because initialize() resets the state', function () {
            assert.deepEqual(new Uint8Array([ ...INITIALIZE, ...CP437, ...HELLO, ...NL ]), first);
            assert.deepEqual(new Uint8Array([ ...INITIALIZE, ...CP437, ...WORLD, ...NL ]), second);
        });
    });

    describe('StarPRNT', function () {
        const STAR_INITIALIZE = [ 27, 64, 24 ];
        const STAR_STANDARD = [ 27, 29, 116, 0 ];
        const STAR_CP737 = [ 27, 29, 116, 15 ];

        /* star/standard: é = 176, ö = 185, ï = 180 */
        const STAR_HELLO = [ 104, 176, 108, 108, 111 ];      /* héllo */
        const STAR_WORLD = [ 119, 185, 114, 108, 100 ];      /* wörld */
        const STAR_CAFE = [ 99, 97, 102, 176 ];              /* café */
        const STAR_NAIVE = [ 110, 97, 180, 118, 101 ];       /* naïve */

        /* cp737: ψυχη */
        const STAR_PSYCHE = [ 175, 172, 174, 158 ];

        describe('codepage(auto) with four lines of accented Latin text', function () {
            let encoder = new ReceiptPrinterEncoder({ language: 'star-prnt', columns: 32, autoFlush: false });
            let result = encoder
                .initialize()
                .codepage('auto')
                .line('héllo')
                .line('wörld')
                .line('café')
                .line('naïve')
                .encode();

            it('should send one code page command before the first line and none before the others', function () {
                assert.deepEqual(new Uint8Array([
                    ...STAR_INITIALIZE,
                    ...STAR_STANDARD, ...STAR_HELLO, ...NL,
                    ...STAR_WORLD, ...NL,
                    ...STAR_CAFE, ...NL,
                    ...STAR_NAIVE, ...NL,
                ]), result);
            });
        });

        describe('codepage(auto) with a Greek line, a Latin line and a Greek line', function () {
            let encoder = new ReceiptPrinterEncoder({ language: 'star-prnt', columns: 32, autoFlush: false });
            let result = encoder
                .initialize()
                .codepage('auto')
                .line('ψυχη')
                .line('hello')
                .line('ψυχη')
                .encode();

            it('should send one code page command per switch', function () {
                assert.deepEqual(new Uint8Array([
                    ...STAR_INITIALIZE,
                    ...STAR_CP737, ...STAR_PSYCHE, ...NL,
                    ...STAR_STANDARD, ...PLAIN, ...NL,
                    ...STAR_CP737, ...STAR_PSYCHE, ...NL,
                ]), result);
            });
        });
    });
});
