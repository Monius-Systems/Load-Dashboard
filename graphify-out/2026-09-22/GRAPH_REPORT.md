# Graph Report - dashboard-shell  (2026-09-21)

## Corpus Check
- 271 files · ~308,399 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: (none) 11, .css 8, .wasm 6)

## Summary
- 7574 nodes · 19188 edges · 211 communities (159 shown, 52 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 502 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4c5b4b21`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- pdf.worker.min.mjs
- ConfigNamespace
- .getOperatorList
- PsWasmCompiler
- XFAObject
- home-page.tsx
- StringObject
- Subform
- .success
- memberRoute
- ContentObject
- Annotation
- tesseract-core-simd.wasm.js
- tesseract-core-relaxedsimd.wasm.js
- tesseract-core-relaxedsimd-lstm.wasm.js
- .parse
- account-page.tsx
- resolve.ts
- worker.min.js
- FormatError
- load-desk.tsx
- tesseract-core-lstm.wasm.js
- tesseract-core-simd-lstm.wasm.js
- warn
- S
- record-input.ts
- tesseract-core.wasm.js
- OptionObject
- I
- types.ts
- I
- I
- S
- I
- S
- S
- I
- S
- I
- account.ts
- S
- LocaleSetNamespace
- Dict
- .put
- memory.ts
- cn
- E
- E
- E
- E
- react
- .getBytes
- contract.ts
- format.ts
- .get
- .parse
- getStringOption
- E
- load-desk-store.ts
- .checkAndRepair
- A
- package.json
- auth.ts
- unreachable
- field-ocr.ts
- rules
- .getTextContent
- profiles.ts
- Glyph
- ChunkedStream
- .process
- ColorSpace
- A
- A
- E
- A
- graphify reference: query, path, explain
- select-field.tsx
- What You Must Do When Invoked
- .push
- extract/route.ts
- .createDocumentHandler
- O
- What You Must Do When Invoked
- ticket-extraction.ts
- translate.ts
- .translateFont
- CFFCompiler
- CipherTransformFactory
- IntegerObject
- components.json
- BasePDFStream
- misread.ts
- O
- setupDoc
- .getUint16
- Builder
- compilerOptions
- dependencies
- XMLParserBase
- logo/route.ts
- z
- 202609150001_load_desk.sql
- devDependencies
- calculateSHA512
- ButtonWidgetAnnotation
- XhtmlObject
- O
- .toString
- O
- O
- auto-processing.test.ts
- FontFinder
- JpegImage
- geometry.ts
- .add
- toast.tsx
- ImageResizer
- [sha]/route.ts
- useT
- $h
- r
- image-cropper.tsx
- AlternateCS
- 202609180001_move_ticket_invoice.sql
- (workspace)/layout.tsx
- M
- $h
- $h
- $h
- bi
- Gf
- section-pager.tsx
- avatar/route.ts
- z
- write
- r
- DecodeStream
- .getByte
- XmlObject
- ChunkedStreamManager
- MessageHandler
- BasePDFStreamReader
- assert
- r
- r
- createNode
- CalRGBCS
- ta
- GlobalImageCache
- SingleIntersector
- ._bindElement
- NullOptimizer
- write
- LabCS
- A & D Trucking of Chicago — Load Desk launch
- graphify reference: extra exports and benchmark
- Root
- write
- write
- scripts
- XFAAttribute
- Base
- phone.ts
- .#Be
- .cg
- DeviceRgbCS
- Datasets
- graphify reference: extra exports and benchmark
- .Yf
- xdp_Xdp
- datasets_Data
- Stream
- ui
- TextState
- .oxfmtrc.json
- La
- AnnotationBorderStyle
- La
- ui
- ui
- ui
- og
- field-regions.test.ts
- og
- BaseLocalCache
- emptyTicket
- ref_node_fs_promises
- worker-env.d.ts
- tesseract.js
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- La
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: GitHub clone and cross-repo merge
- La
- AGENTS.md
- CLAUDE.md
- .claude/CLAUDE.md
- .claude/skills/graphify/references/extraction-spec.md
- .codex/skills/graphify/references/extraction-spec.md
- pg
- 202609210001_misreads.sql
- ref_lib_scanner_scanner_worker_ts_worker
- ref_scanner_worker_ts_worker

## God Nodes (most connected - your core abstractions)
1. `XFAObject` - 209 edges
2. `warn()` - 174 edges
3. `cn()` - 166 edges
4. `ConfigNamespace` - 141 edges
5. `LoadDesk()` - 134 edges
6. `TemplateNamespace` - 115 edges
7. `shadow()` - 104 edges
8. `FormatError` - 86 edges
9. `getStringOption()` - 85 edges
10. `S()` - 67 edges

## Surprising Connections (you probably didn't know these)
- `Step 1 — Traversal` --references--> `corrected()`  [INFERRED]
  .claude/skills/graphify/references/query.md → tests/recovery-end-to-end.test.ts
- `Step 1 — Traversal` --references--> `corrected()`  [INFERRED]
  .codex/skills/graphify/references/query.md → tests/recovery-end-to-end.test.ts
- `AccountPage()` --indirect_call--> `initialAccountSnapshot()`  [INFERRED]
  components/account/account-page.tsx → lib/account.ts
- `AccountPage()` --indirect_call--> `subscribeAccount()`  [INFERRED]
  components/account/account-page.tsx → lib/account.ts
- `savePhoto()` --calls--> `uploadAvatar()`  [EXTRACTED]
  components/account/account-page.tsx → lib/account.ts

## Import Cycles
- 4-file cycle: `lib/load-desk/format.ts -> lib/load-desk/recovery/index.ts -> lib/load-desk/recovery/resolve.ts -> lib/load-desk/profiles.ts -> lib/load-desk/format.ts`
- 5-file cycle: `lib/load-desk/format.ts -> lib/load-desk/validate.ts -> lib/load-desk/recovery/index.ts -> lib/load-desk/recovery/resolve.ts -> lib/load-desk/profiles.ts -> lib/load-desk/format.ts`

## Communities (211 total, 52 thin omitted)

### Community 0 - "pdf.worker.min.mjs"
Cohesion: 0.01
Nodes (187): aa, af, Ai, al, Ao, ar, as, ba (+179 more)

### Community 1 - "ConfigNamespace"
Cohesion: 0.01
Nodes (64): Acrobat, Acrobat7, AddSilentPrint, AddViewerPreferences, Agent, BatchOutput, Cache, Change (+56 more)

### Community 2 - ".getOperatorList"
Cohesion: 0.05
Nodes (6): getTransformMatrix(), Intersector, lookupRect(), OperatorList, Page, TimeSlotManager

### Community 3 - "PsWasmCompiler"
Cohesion: 0.05
Nodes (24): ast_Parser, buildPostScriptWasmFunction(), encodeASCIIString(), lexer_Lexer, _nodesEqual(), parsePostScriptFunction(), PsArgNode, PsBinaryNode (+16 more)

### Community 4 - "XFAObject"
Cohesion: 0.01
Nodes (69): Arc, Assist, Barcode, Bind, BindItems, Bookend, Border, Break (+61 more)

### Community 5 - "home-page.tsx"
Cohesion: 0.06
Nodes (53): metadata, AXIS_TICK, ChartLine, LazyChart, LoadsAreaChart(), LoadsAreaChart(), PointTooltip(), tonsText() (+45 more)

### Community 6 - "StringObject"
Cohesion: 0.02
Nodes (42): Amd, AppearanceFilter, Certificate, config_Picture, connection_set_Uri, ConnectionSet, ConnectionSetNamespace, Creator (+34 more)

### Community 7 - "Subform"
Cohesion: 0.05
Nodes (13): Step 2 - Detect files, Step 2 - Detect files, addHTML(), Area, createLine(), ExclGroup, flushHTML(), getAvailableSpace() (+5 more)

### Community 8 - ".success"
Cohesion: 0.04
Nodes (44): applyAssist(), ariaLabel(), Caption, CheckButton, checkDimensions(), ChoiceList, computeBbox(), Corner (+36 more)

### Community 9 - "memberRoute"
Cohesion: 0.17
Nodes (23): LANGUAGES, PUT(), POST(), GET(), oneLine(), PUT(), DELETE(), GET() (+15 more)

### Community 10 - "ContentObject"
Cohesion: 0.02
Nodes (24): AlwaysEmbed, BehaviorOverride, BooleanElement, ContentObject, DateElement, DateTime, DateTimeSymbols, Decimal (+16 more)

### Community 12 - "tesseract-core-simd.wasm.js"
Cohesion: 0.03
Nodes (61): A(), Aa, B(), Bb(), chmod(), chown(), close(), create() (+53 more)

### Community 13 - "tesseract-core-relaxedsimd.wasm.js"
Cohesion: 0.04
Nodes (57): A(), Aa, B(), Bb(), chmod(), chown(), close(), create() (+49 more)

### Community 14 - "tesseract-core-relaxedsimd-lstm.wasm.js"
Cohesion: 0.03
Nodes (58): Aa, B(), chmod(), chown(), close(), create(), Db(), fchmod() (+50 more)

### Community 15 - ".parse"
Cohesion: 0.10
Nodes (3): DataHandler, StructTreePage, XFAFactory

### Community 16 - "account-page.tsx"
Cohesion: 0.06
Nodes (79): InvoiceDialog(), InvoiceView, addressOf(), blankClient(), ClientDraft, ClientsSection(), confirmDelete(), draftFromClient() (+71 more)

### Community 17 - "resolve.ts"
Cohesion: 0.06
Nodes (69): normalizeKey(), EvidenceSource, ADVISORY_SOURCES, combinedWeight(), CRITICAL_FIELDS, DERIVATION_SOURCES, DERIVED_CONFIDENCE_CAP, EVIDENCE_WEIGHTS (+61 more)

### Community 18 - "worker.min.js"
Cohesion: 0.08
Nodes (72): buildMeshVertexData(), getB(), MeshShading, MeshStreamReader, a(), at(), B(), c() (+64 more)

### Community 19 - "FormatError"
Cohesion: 0.07
Nodes (21): Cmd, expectInt(), expectString(), FlateStream, FormatError, InvalidPDFException, isCmd(), Linearization (+13 more)

### Community 20 - "load-desk.tsx"
Cohesion: 0.03
Nodes (172): metadata, applyCustomer(), applyTruck(), ASK_LABELS, buildQueueItem(), clientBillTo(), defaultInvoice(), editKey() (+164 more)

### Community 21 - "tesseract-core-lstm.wasm.js"
Cohesion: 0.04
Nodes (52): Aa, B(), chown(), Db(), fchmod(), fchown(), fstat(), hi() (+44 more)

### Community 22 - "tesseract-core-simd-lstm.wasm.js"
Cohesion: 0.04
Nodes (52): Aa, B(), chown(), Db(), fchmod(), fchown(), fstat(), hi() (+44 more)

### Community 23 - "warn"
Cohesion: 0.03
Nodes (34): addCachedImageOps(), BaseShading, CheckedOperatorList, CmykICCBasedCS, ColorSpaceUtils, createDataNode(), DefaultAppearanceEvaluator, DummyShading (+26 more)

### Community 24 - "S"
Cohesion: 0.04
Nodes (6): F(), G(), Jh(), O(), S(), ui()

### Community 25 - "record-input.ts"
Cohesion: 0.08
Nodes (47): datedFromTicket(), staleInvoiceDates(), ClientProfile, CompanyProfile, amount(), cleanAddresses(), cleanLocationRates(), CLIPPED_EDGES (+39 more)

### Community 26 - "tesseract-core.wasm.js"
Cohesion: 0.04
Nodes (35): Aa, B(), Bg(), Db(), fchmod(), fchown(), fstat(), gb() (+27 more)

### Community 27 - "OptionObject"
Cohesion: 0.02
Nodes (36): ADBE_JSConsole, ADBE_JSDebugger, Attributes, AutoSave, config_Validate, Conformance, Destination, DigestMethod (+28 more)

### Community 28 - "I"
Cohesion: 0.04
Nodes (9): Ai(), Ha(), I(), ii(), Ja(), Kh(), ri(), vi() (+1 more)

### Community 29 - "types.ts"
Cohesion: 0.05
Nodes (60): TicketRecovery, UNKNOWN_FRAME, applyKnownCarrier(), KNOWN_CARRIERS, KnownCarrier, knownCarrierIn(), letters(), learnedFaint() (+52 more)

### Community 30 - "I"
Cohesion: 0.04
Nodes (8): Ai(), Ha(), I(), ii(), Kh(), ri(), vi(), yi()

### Community 31 - "I"
Cohesion: 0.04
Nodes (8): Ai(), Ha(), I(), ii(), Ja(), ri(), vi(), yi()

### Community 32 - "S"
Cohesion: 0.05
Nodes (5): F(), G(), Jh(), r(), S()

### Community 33 - "I"
Cohesion: 0.04
Nodes (7): Ai(), Ha(), I(), ii(), ri(), vi(), yi()

### Community 34 - "S"
Cohesion: 0.05
Nodes (4): F(), G(), Jh(), S()

### Community 35 - "S"
Cohesion: 0.05
Nodes (5): F(), G(), r(), S(), Sf()

### Community 36 - "I"
Cohesion: 0.04
Nodes (7): Ai(), Ha(), I(), ii(), ri(), vi(), yi()

### Community 37 - "S"
Cohesion: 0.05
Nodes (4): F(), G(), Jh(), S()

### Community 38 - "I"
Cohesion: 0.04
Nodes (7): Ai(), Ha(), I(), ii(), ri(), vi(), yi()

### Community 39 - "account.ts"
Cohesion: 0.06
Nodes (55): DetailsForm(), save(), SecurityPanel(), leave(), submit(), AccountLink(), AccountMenu(), leave() (+47 more)

### Community 40 - "S"
Cohesion: 0.05
Nodes (5): F(), G(), Jh(), S(), ui()

### Community 41 - "LocaleSetNamespace"
Cohesion: 0.03
Nodes (24): CalendarSymbols, CurrencySymbol, CurrencySymbols, DatePattern, DatePatterns, Day, DayNames, Era (+16 more)

### Community 42 - "Dict"
Cohesion: 0.04
Nodes (41): CaretAnnotation, ChoiceWidgetAnnotation, CircleAnnotation, codePointIter(), createImage(), createImageDict(), createPNGLikeImage(), createRawImage() (+33 more)

### Community 43 - ".put"
Cohesion: 0.06
Nodes (11): adjustMapping(), EvalState, getModificationDate(), getNewAnnotationsMap(), makeArr(), PageData, PDFEditor, Ref (+3 more)

### Community 44 - "memory.ts"
Cohesion: 0.06
Nodes (51): normalizeName(), ClippedEdge, FieldResolution, alignedFrom(), COUNTRY, editsApart(), fragmentFits(), siteFits() (+43 more)

### Community 45 - "cn"
Cohesion: 0.03
Nodes (123): SWIPE_PAGES, AlertDialogMedia(), AlertDialogOverlay(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount() (+115 more)

### Community 46 - "E"
Cohesion: 0.06
Nodes (12): E(), gb(), hb(), J(), L(), Lf(), M(), Mb() (+4 more)

### Community 47 - "E"
Cohesion: 0.06
Nodes (8): E(), J(), L(), M(), Nf(), Q(), Rf(), zi()

### Community 48 - "E"
Cohesion: 0.06
Nodes (7): E(), J(), K(), M(), Of(), Q(), zi()

### Community 49 - "E"
Cohesion: 0.06
Nodes (8): E(), J(), L(), M(), Nf(), Q(), Rf(), zi()

### Community 50 - "react"
Cohesion: 0.09
Nodes (25): app_globals, metadata, viewport, FittedInvoice(), TicketViewer(), AppCursor(), subscribe(), wanted() (+17 more)

### Community 51 - ".getBytes"
Cohesion: 0.14
Nodes (7): decrypt(), isHexDigit(), isSpecial(), Lexer, toHexDigit(), Type1CharString, Type1Parser

### Community 52 - "contract.ts"
Cohesion: 0.11
Nodes (35): Evidence, FieldStatus, ObservedField, ObservedTicket, ReviewReason, detectVendor(), anyText(), GENERIC_REDUNDANT_SOURCES (+27 more)

### Community 53 - "format.ts"
Cohesion: 0.09
Nodes (44): COLUMNS, InvoiceLine, InvoiceSheet(), lineLayout(), marked(), downloadLedger(), saveNewCustomer(), business (+36 more)

### Community 54 - ".get"
Cohesion: 0.03
Nodes (35): Catalog, appendIfJavaScriptDict(), addPageDict(), addPageError(), parseNestedOrder(), parseOnOff(), parseOrder(), collectActions() (+27 more)

### Community 55 - ".parse"
Cohesion: 0.05
Nodes (17): bytesToString(), CFF, CFFCharset, CFFDict, CFFEncoding, CFFFDSelect, CFFHeader, CFFParser (+9 more)

### Community 56 - "getStringOption"
Cohesion: 0.05
Nodes (15): Color, Data, Fill, getFloat(), getInteger(), getKeyword(), getMeasurement(), getRatio() (+7 more)

### Community 57 - "E"
Cohesion: 0.07
Nodes (6): E(), J(), L(), M(), Nf(), Q()

### Community 58 - "load-desk-store.ts"
Cohesion: 0.16
Nodes (23): GET(), PATCH(), POST(), setLogoVersion(), invoiceKeyOf(), NewClient, NewCompany, NewCustomer (+15 more)

### Community 59 - ".checkAndRepair"
Cohesion: 0.07
Nodes (28): adjustWidths(), amendFallbackToUnicode(), compileFontInfo(), convertCidString(), createCmapTable(), createNameTable(), createOS2Table(), createPostscriptName() (+20 more)

### Community 60 - "A"
Cohesion: 0.11
Nodes (39): A(), Ab(), Bb(), Cb(), chdir(), chown(), createNode(), Eb() (+31 more)

### Community 61 - "package.json"
Cohesion: 0.06
Nodes (33): engines, node, name, private, type, version, @base-ui/react, @cloudflare/vite-plugin (+25 more)

### Community 62 - "auth.ts"
Cohesion: 0.19
Nodes (22): POST(), POST(), GET(), POST(), redirect(), POST(), authClient(), AuthMode (+14 more)

### Community 63 - "unreachable"
Cohesion: 0.07
Nodes (4): BasePdfManager, BasePDFStreamRangeReader, BaseStream, unreachable()

### Community 64 - "field-ocr.ts"
Cohesion: 0.20
Nodes (21): blankCanvas(), center(), FIELD_OCR_MARKER, fieldRegions(), find(), heidelbergRegions(), height(), isLabel() (+13 more)

### Community 65 - "rules"
Cohesion: 0.06
Nodes (33): categories, correctness, env, browser, builtin, node, ignorePatterns, options (+25 more)

### Community 66 - ".getTextContent"
Cohesion: 0.21
Nodes (16): addFakeSpaces(), appendEOL(), applyInverseRotation(), buildTextContentItem(), closePendingMarkedContentItems(), compareWithLastPosition(), ensureTextContentItem(), flushTextContentItem() (+8 more)

### Community 67 - "profiles.ts"
Cohesion: 0.05
Nodes (78): InvoiceAddressForm(), chooseDefault(), chooseTruck(), commitInvoiceStart(), save(), oneLine(), confirmGroup(), rememberAddress() (+70 more)

### Community 68 - "Glyph"
Cohesion: 0.08
Nodes (6): CompositeGlyph, Contour, GlyfTable, Glyph, GlyphHeader, SimpleGlyph

### Community 70 - ".process"
Cohesion: 0.06
Nodes (10): addHex(), BinaryCMapReader, BinaryCMapStream, CMap, createBuiltInCMap(), extendCMap(), hexToInt(), hexToStr() (+2 more)

### Community 71 - "ColorSpace"
Cohesion: 0.13
Nodes (3): ColorSpace, DeviceGrayCS, PatternCS

### Community 72 - "A"
Cohesion: 0.16
Nodes (30): A(), Ab(), Bb(), Cb(), chdir(), chmod(), create(), createNode() (+22 more)

### Community 73 - "A"
Cohesion: 0.16
Nodes (30): A(), Ab(), Bb(), Cb(), chdir(), createNode(), Eb(), Fb() (+22 more)

### Community 74 - "E"
Cohesion: 0.09
Nodes (10): E(), isFile(), J(), Kf(), L(), Mf(), Of(), Q() (+2 more)

### Community 75 - "A"
Cohesion: 0.16
Nodes (30): A(), Ab(), Bb(), Cb(), chdir(), chmod(), create(), createNode() (+22 more)

### Community 76 - "graphify reference: query, path, explain"
Cohesion: 0.14
Nodes (12): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal, For /graphify explain, For /graphify path, graphify reference: query, path, explain (+4 more)

### Community 77 - "select-field.tsx"
Cohesion: 0.19
Nodes (12): SelectOption, components_ui_select_select, SelectContent(), SelectGroup(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton() (+4 more)

### Community 78 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (23): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+15 more)

### Community 79 - ".push"
Cohesion: 0.07
Nodes (15): addChildren(), encodeToXmlString(), generateFont(), getFamilyName(), getFontSubstitution(), getPdfColorArray(), getQuadPoints(), getRgbColor() (+7 more)

### Community 80 - "extract/route.ts"
Cohesion: 0.16
Nodes (15): ALLOWED_TYPES, extract(), failure(), ModelAnswer, ModelError, outputText(), read(), readImage() (+7 more)

### Community 81 - ".createDocumentHandler"
Cohesion: 0.07
Nodes (9): AnnotationFactory, clearGlobalCaches(), JBig2CCITTFaxImage, WasmImage, finishWorkerTask(), getPassword(), loadDocument(), startWorkerTask() (+1 more)

### Community 82 - "O"
Cohesion: 0.08
Nodes (9): bg(), bi(), O(), pi(), si(), T(), tg(), write() (+1 more)

### Community 83 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (23): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+15 more)

### Community 84 - "ticket-extraction.ts"
Cohesion: 0.05
Nodes (70): blobOf(), canvasOf(), ExtractedPage, extractPages(), PageReading, pause(), postImage(), batchPercent() (+62 more)

### Community 85 - "translate.ts"
Cohesion: 0.12
Nodes (27): LanguagePanel(), choose(), PL_PAGES, PL_NOUNS, PL_PATTERNS, PL_TEXT, adoptAccountLocale(), apply() (+19 more)

### Community 86 - ".translateFont"
Cohesion: 0.07
Nodes (21): applyStandardFontGlyphMap(), buildToFontChar(), CMapFactory, es, getEncoding(), getLookupTableFactory(), getStandardFontName(), getUnicodeForGlyph() (+13 more)

### Community 87 - "CFFCompiler"
Cohesion: 0.12
Nodes (4): CFFCompiler, CFFFont, CFFIndex, CFFOffsetTracker

### Community 88 - "CipherTransformFactory"
Cohesion: 0.20
Nodes (4): ARCFourCipher, calculateMD5(), CipherTransformFactory, PasswordException

### Community 89 - "IntegerObject"
Cohesion: 0.05
Nodes (13): AdjustData, AdobeExtensionLevel, CompressObjectStream, Copies, CurrentPage, IntegerObject, Level, MsgId (+5 more)

### Community 90 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 91 - "BasePDFStream"
Cohesion: 0.18
Nodes (3): BasePDFStream, PDFWorkerStream, PDFWorkerStreamRangeReader

### Community 92 - "misread.ts"
Cohesion: 0.13
Nodes (20): apiJson(), ApiResult, dataMode, Session, loadLearnedMisreads(), noteMisread(), dateDigits(), dateMisread() (+12 more)

### Community 93 - "O"
Cohesion: 0.09
Nodes (6): bi(), O(), pi(), si(), T(), tg()

### Community 94 - "setupDoc"
Cohesion: 0.18
Nodes (8): AbortException, fetchSync(), NetworkPdfManager, ensureNotTerminated(), setupDoc(), onFailure(), onSuccess(), pdfManagerReady()

### Community 95 - ".getUint16"
Cohesion: 0.09
Nodes (24): an, BrotliStream, buildComponentData(), buildHuffmanTable(), decodeScan(), decodeBlock(), decodeHuffman(), decodeMcu() (+16 more)

### Community 97 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 98 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @base-ui/react, class-variance-authority, clsx, lucide-react, motion, pdfjs-dist, react (+11 more)

### Community 99 - "XMLParserBase"
Cohesion: 0.06
Nodes (6): DatasetXMLParser, MetadataParser, SimpleDOMNode, SimpleXMLParser, XFAParser, XMLParserBase

### Community 100 - "logo/route.ts"
Cohesion: 0.33
Nodes (11): DELETE(), GET(), PUT(), tooLarge(), folder(), loadLogo(), LOGO_VERSION, MAX_LOGO_BYTES (+3 more)

### Community 101 - "z"
Cohesion: 0.23
Nodes (18): Ab(), Cb(), chdir(), createNode(), Eb(), Fb(), Hf(), isFIFO() (+10 more)

### Community 102 - "202609150001_load_desk.sql"
Cohesion: 0.17
Nodes (15): auth.users, public.load_desk_release_invoice, load_desk_profiles_one_company, load_desk_profiles_workspace, load_desk_records_check_invoice, load_desk_records_invoice, load_desk_records_release_invoice, load_desk_records_workspace_date (+7 more)

### Community 103 - "devDependencies"
Cohesion: 0.11
Nodes (18): devDependencies, @cloudflare/vite-plugin, @cloudflare/workers-types, @openai/sites-vite-plugin, oxfmt, oxlint, oxlint-tsgolint, @playwright/test (+10 more)

### Community 104 - "calculateSHA512"
Cohesion: 0.09
Nodes (17): AES128Cipher, AES256Cipher, AESBaseCipher, calculateSHA384(), calculateSHA512(), ch(), isArrayEqual(), littleSigma() (+9 more)

### Community 106 - "XhtmlObject"
Cohesion: 0.04
Nodes (21): a, B, Body, Br, Button, fixURL(), Html, I (+13 more)

### Community 107 - "O"
Cohesion: 0.11
Nodes (4): bi(), O(), pi(), si()

### Community 108 - ".toString"
Cohesion: 0.05
Nodes (20): computeIDs(), deepCompare(), DocumentData, escapePDFName(), getIndexes(), incrementalUpdate(), isRefsEqual(), MurmurHash3_64 (+12 more)

### Community 109 - "O"
Cohesion: 0.11
Nodes (4): bi(), O(), pi(), si()

### Community 110 - "O"
Cohesion: 0.11
Nodes (4): bi(), O(), pi(), si()

### Community 111 - "auto-processing.test.ts"
Cohesion: 0.07
Nodes (43): announce(), clearDesk(), DeskExtraction, DeskSession, deskSnapshot(), DeskStatus, EMPTY, listeners (+35 more)

### Community 112 - "FontFinder"
Cohesion: 0.16
Nodes (4): FontFinder, FontInfo, FontSelector, makeObj()

### Community 114 - "geometry.ts"
Cohesion: 0.06
Nodes (59): blobFrom(), canvas(), DocumentScanner(), capture(), checkFraming(), frame(), startCamera(), stopCamera() (+51 more)

### Community 115 - ".add"
Cohesion: 0.09
Nodes (12): Commands, compileCharString(), bezierCurveTo(), lineTo(), moveTo(), compileGlyf(), lineTo(), moveTo() (+4 more)

### Community 116 - "toast.tsx"
Cohesion: 0.15
Nodes (8): ToastAction(), ToastClose(), ToastContent(), ToastDescription(), Toaster(), ToastTitle(), ToastViewport(), ref_base_ui_react_toast

### Community 118 - "[sha]/route.ts"
Cohesion: 0.27
Nodes (9): ALLOWED_TYPES, Context, GET(), PUT(), MAX_ORIGINAL_BYTES, SHA256, downloadOriginal(), objectPath() (+1 more)

### Community 119 - "useT"
Cohesion: 0.10
Nodes (26): InvoiceAddressPanel(), ProfileHero(), savePhoto(), shortDate(), WorkspacePanel(), dropLogo(), saveLogo(), saveName() (+18 more)

### Community 120 - "$h"
Cohesion: 0.12
Nodes (8): gb(), $h(), a(), hb(), ig(), Mb(), V(), Zf()

### Community 121 - "r"
Cohesion: 0.15
Nodes (12): Cg(), Ja(), r(), Rb(), read(), Sb(), C, h() (+4 more)

### Community 122 - "image-cropper.tsx"
Cohesion: 0.22
Nodes (13): ImageCropper(), keep(), zoomTo(), suspendSmoothCursor(), Box, clampOffset(), coverScale(), MAX_ZOOM (+5 more)

### Community 125 - "(workspace)/layout.tsx"
Cohesion: 0.25
Nodes (8): app_workspace_account_account, app_workspace_home, WorkspaceLayout(), app_workspace_load_desk_load_desk, app_workspace_profiles, app_workspace_records_records, sessionShellAccount(), ref_next_headers

### Community 127 - "$h"
Cohesion: 0.13
Nodes (7): gb(), $h(), a(), hb(), hg(), Mb(), Yf()

### Community 128 - "$h"
Cohesion: 0.13
Nodes (7): eg(), gb(), $h(), a(), hb(), Mb(), Vf()

### Community 129 - "$h"
Cohesion: 0.13
Nodes (7): gb(), $h(), a(), hb(), hg(), Mb(), Yf()

### Community 130 - "bi"
Cohesion: 0.13
Nodes (5): bi(), pi(), sg(), si(), T()

### Community 131 - "Gf"
Cohesion: 0.13
Nodes (6): dg(), Gf(), $h(), a(), Mb(), Uf()

### Community 132 - "section-pager.tsx"
Cohesion: 0.05
Nodes (30): app_login_login, metadata, metadata, metadata, metadata, metadata, client_config, AccountPage() (+22 more)

### Community 133 - "avatar/route.ts"
Cohesion: 0.27
Nodes (11): DELETE(), GET(), PUT(), tooLarge(), AVATAR_VERSION, folder(), loadAvatar(), MAX_AVATAR_BYTES (+3 more)

### Community 134 - "z"
Cohesion: 0.34
Nodes (14): Ab(), Cb(), chdir(), Eb(), Fb(), Jb(), lookup(), nb() (+6 more)

### Community 135 - "write"
Cohesion: 0.15
Nodes (12): ag(), chmod(), close(), create(), fsync(), Jf(), lchmod(), oh() (+4 more)

### Community 136 - "r"
Cohesion: 0.21
Nodes (10): Ja(), lstat(), r(), Rb(), readFile(), Sb(), C, h() (+2 more)

### Community 137 - "DecodeStream"
Cohesion: 0.05
Nodes (9): AsciiHexStream, DecodeStream, DecryptStream, JpegStream, JpxStream, LZWStream, PredictorStream, RunLengthStream (+1 more)

### Community 138 - ".getByte"
Cohesion: 0.11
Nodes (8): Ascii85Stream, parseOperand(), CipherTransform, find(), findBlock(), isWhiteSpace(), Parser, rememberToken()

### Community 141 - "MessageHandler"
Cohesion: 0.18
Nodes (5): MessageHandler, ResponseException, UnknownErrorException, WorkerMessageHandler, wrapReason()

### Community 143 - "assert"
Cohesion: 0.18
Nodes (5): assert(), convertBlackAndWhiteToRGBA(), convertToRGBA(), PDFImage, toRomanNumerals()

### Community 144 - "r"
Cohesion: 0.23
Nodes (10): bg(), Ja(), lstat(), r(), Rb(), readFile(), Sb(), C (+2 more)

### Community 145 - "r"
Cohesion: 0.23
Nodes (10): bg(), Ja(), lstat(), r(), Rb(), readFile(), Sb(), C (+2 more)

### Community 146 - "createNode"
Cohesion: 0.17
Nodes (7): createNode(), dg(), Gf(), $h(), a(), isFIFO(), symlink()

### Community 148 - "ta"
Cohesion: 0.08
Nodes (11): CCITTFaxStream, Jbig2Stream, JpxError, JpxImage, oa(), doRun(), receiveInstance(), updateMemoryViews() (+3 more)

### Community 153 - "write"
Cohesion: 0.17
Nodes (8): ag(), isFile(), Jf(), sg(), T(), write(), writeFile(), Yf()

### Community 154 - "LabCS"
Cohesion: 0.13
Nodes (3): CalGrayCS, DeviceCmykCS, LabCS

### Community 155 - "A & D Trucking of Chicago — Load Desk launch"
Cohesion: 0.18
Nodes (10): 1. Create the database tables (once) — done, 2. Give A & D Trucking accounts, 3. Deploy the app, 4. Connect it to the website's Client Login, A & D Trucking of Chicago — Load Desk launch, Adding a second company, Before handing over, How access and data work (+2 more)

### Community 156 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 158 - "write"
Cohesion: 0.18
Nodes (8): close(), eg(), fsync(), sg(), T(), wg(), write(), writeFile()

### Community 159 - "write"
Cohesion: 0.18
Nodes (8): close(), eg(), fsync(), sg(), T(), wg(), write(), writeFile()

### Community 160 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, format, lint, prebuild, start, test (+2 more)

### Community 162 - "Base"
Cohesion: 0.22
Nodes (5): graphify reference: transcribe video and audio, Step 2.5 - Transcribe video / audio files (only if video files detected), graphify reference: transcribe video and audio, Step 2.5 - Transcribe video / audio files (only if video files detected), Base

### Community 163 - "phone.ts"
Cohesion: 0.62
Nodes (5): digitsOf(), phoneDisplay(), phoneEdit(), phoneInput(), tenDigits()

### Community 165 - ".cg"
Cohesion: 0.29
Nodes (7): cg(), Gg(), Rb(), read(), Sb(), C, h()

### Community 168 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 169 - ".Yf"
Cohesion: 0.33
Nodes (6): Bg(), Rb(), read(), Sb(), C, h()

### Community 172 - "Stream"
Cohesion: 0.12
Nodes (3): LocalPdfManager, NullStream, Stream

### Community 175 - ".oxfmtrc.json"
Cohesion: 0.33
Nodes (5): ignorePatterns, printWidth, $schema, singleQuote, sortPackageJson

### Community 183 - "field-regions.test.ts"
Cohesion: 0.50
Nodes (3): OcrWord, page(), word()

### Community 186 - "BaseLocalCache"
Cohesion: 0.06
Nodes (10): AppearanceStreamEvaluator, BaseLocalCache, GlobalColorSpaceCache, LocalColorSpaceCache, LocalFunctionCache, LocalGStateCache, LocalImageCache, LocalTilingPatternCache (+2 more)

### Community 189 - "emptyTicket"
Cohesion: 0.08
Nodes (38): applyFieldRows(), cityStateZip(), cleanRow(), detectLayout(), digitString(), fieldRows(), heidelbergSite(), isoDate() (+30 more)

### Community 198 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 199 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 200 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 201 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 202 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 203 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **589 isolated node(s):** `$schema`, `singleQuote`, `printWidth`, `sortPackageJson`, `ignorePatterns` (+584 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2298 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **52 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `f()` connect `worker.min.js` to `pdf.worker.min.mjs`, `A`, `A`, `A`, `tesseract-core-simd.wasm.js`, `tesseract-core-relaxedsimd.wasm.js`, `tesseract-core-relaxedsimd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js`, `tesseract-core.wasm.js`, `A`?**
  _High betweenness centrality (0.372) - this node is a cross-community bridge._
- **Why does `TemplateNamespace` connect `XFAObject` to `pdf.worker.min.mjs`, `PsWasmCompiler`, `StringObject`, `Subform`, `.success`, `ContentObject`, `XhtmlObject`, `graphify reference: query, path, explain`, `.put`, `assert`, `resolve.ts`, `getStringOption`, `OptionObject`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Why does `Line` connect `.success` to `pdf.worker.min.mjs`, `resolve.ts`, `XFAObject`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `LoadDesk()` (e.g. with `deskSnapshot()` and `serverDeskSnapshot()`) actually correct?**
  _`LoadDesk()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `singleQuote`, `printWidth` to the rest of the system?**
  _589 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pdf.worker.min.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.010354964679039971 - nodes in this community are weakly interconnected._
- **Should `ConfigNamespace` be split into smaller, more focused modules?**
  _Cohesion score 0.011270765450563538 - nodes in this community are weakly interconnected._