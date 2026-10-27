import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useAuthContext } from '../../context/AuthContext';
import { parsePdfFile } from '../../hooks/usePDFImport';
import {
  applyTemplate,
  buildTemplate,
  defaultLayoutName,
  headingsFor,
  lineText,
  pageOneLines,
} from '../../lib/pdfLayouts';

type Props = NativeStackScreenProps<InventoryStackParamList, 'TeachLayout'>;
type Mode = 'header' | 'skip' | 'end';

const MAX_LINES = 80;
const PREVIEW_ROWS = 5;

/**
 * "Teach it" on the phone (WP26 Phase 3b, TODO 9.21). Same steps and the
 * same shared template code as the web's TeachLayoutDialog: tap the line
 * with the column headings, pick the name and quantity columns (category
 * and code optional), mark lines to skip and where the items end, check the
 * preview, save. The PDF is then read again with the new layout.
 */
export default function TeachLayoutScreen({ navigation, route }: Props) {
  const { pages, file, existing } = route.params;
  const { profile } = useAuthContext();
  const lines: { str: string }[][] = useMemo(() => pageOneLines(pages).slice(0, MAX_LINES), [pages]);

  const [mode, setMode] = useState<Mode>('header');
  const [headerIndex, setHeaderIndex] = useState(-1);
  const [nameColumn, setNameColumn] = useState(-1);
  const [quantityColumn, setQuantityColumn] = useState(-1);
  const [categoryColumn, setCategoryColumn] = useState(-1);
  const [codeColumn, setCodeColumn] = useState(-1);
  const [categoryFrom, setCategoryFrom] = useState<'column' | 'heading' | 'none'>('none');
  const [endIndex, setEndIndex] = useState(-1);
  const [skipIndexes, setSkipIndexes] = useState<number[]>([]);
  const [name, setName] = useState(existing?.name ?? defaultLayoutName(pages));
  const [saving, setSaving] = useState(false);

  const headings = useMemo(() => headingsFor(pages, headerIndex), [pages, headerIndex]);
  const built = useMemo(
    () =>
      buildTemplate(pages, {
        headerIndex,
        nameColumn,
        quantityColumn,
        categoryColumn,
        codeColumn,
        categoryFrom,
        endIndex,
        skipIndexes,
      }),
    [pages, headerIndex, nameColumn, quantityColumn, categoryColumn, codeColumn, categoryFrom, endIndex, skipIndexes]
  );
  const preview = useMemo(
    () => (built.errors || !built.template ? null : applyTemplate(built.template, pages)),
    [built, pages]
  );
  const canSave = !!preview && preview.rows.length > 0 && !saving;

  function pickLine(i: number) {
    if (mode === 'header') {
      setHeaderIndex(i);
      setNameColumn(-1);
      setQuantityColumn(-1);
      setCategoryColumn(-1);
      setCodeColumn(-1);
      setSkipIndexes((prev) => prev.filter((x) => x > i));
      setEndIndex((prev) => (prev > i ? prev : -1));
      setMode('skip');
    } else if (i > headerIndex) {
      if (mode === 'skip') {
        setSkipIndexes((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
      } else {
        setEndIndex((prev) => (prev === i ? -1 : i));
      }
    }
  }

  async function save() {
    if (!canSave || !built.template) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Layout name', 'Give this layout a name.');
      return;
    }
    setSaving(true);
    const query = existing
      ? supabase.from('pdf_templates').update({ name: trimmed, template: built.template }).eq('id', existing.id)
      : supabase.from('pdf_templates').insert({ org_id: profile?.org_id, name: trimmed, template: built.template });
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) {
      setSaving(false);
      Alert.alert(
        "Couldn't save the layout",
        error?.code === '23505'
          ? 'You already have a layout with this name. Choose another name.'
          : error?.message || 'Only owners, admins and department heads can save layouts.'
      );
      return;
    }
    // Read the PDF again so the review shows the new layout's rows.
    try {
      const result = await parsePdfFile(file);
      navigation.popTo('PDFReview', {
        parsedItems: result.items,
        layout: result.layout,
        pages: result.pages,
        file: result.file,
      });
    } catch (e) {
      setSaving(false);
      Alert.alert(
        'Layout saved',
        `GripTrack will use "${trimmed}" for this supplier's PDFs. Import the PDF again to use it now.` +
          (e instanceof Error && e.message ? `\n\n${e.message}` : '')
      );
    }
  }

  const lineState = (i: number) =>
    i === headerIndex ? 'header' : i === endIndex ? 'end' : skipIndexes.includes(i) ? 'skip' : '';

  const instructions: Record<Mode, string> = {
    header: 'Tap the line with the column headings (for example: Description, Qty).',
    skip: 'Tap any line that is not an item (subtotals, page headers) to skip lines like it. Tap again to undo.',
    end: 'Tap the first line after the items (for example: Total). Optional.',
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      className="bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Text className="text-text text-sm mb-4">
          Do this once per supplier. GripTrack remembers the layout and uses it for their next PDFs, in the app and
          on the web. Only the layout is saved, never the items.
        </Text>

        <View className="flex-row gap-2 mb-2" accessibilityRole="tablist">
          {(['header', 'skip', 'end'] as Mode[]).map((m) => {
            const disabled = m !== 'header' && headerIndex < 0;
            const label = m === 'header' ? 'Headings' : m === 'skip' ? 'Skip lines' : 'Items end';
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                disabled={disabled}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m, disabled }}
                className={`px-3 py-1.5 rounded-full border ${
                  mode === m ? 'border-accent bg-accent/15' : 'border-white/15'
                } ${disabled ? 'opacity-40' : ''}`}
              >
                <Text className={`text-xs ${mode === m ? 'text-slate-100' : 'text-text'}`}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text className="text-slate-100 text-sm mb-2">{instructions[mode]}</Text>

        <View className="border border-white/10 rounded-lg mb-5" accessibilityLabel="Page 1 of the PDF">
          {lines.map((line, i) => {
            const state = lineState(i);
            return (
              <TouchableOpacity
                key={i}
                testID={`teach-line-${i}`}
                onPress={() => pickLine(i)}
                accessibilityRole="button"
                accessibilityLabel={`${state ? `${state}: ` : ''}${lineText(line)}`}
                className={`px-2.5 py-2 border-b border-white/5 ${
                  state === 'header' ? 'bg-accent/20' : state === 'end' ? 'bg-warning/15' : ''
                }`}
              >
                <Text
                  style={{ fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                  className={
                    state === 'skip'
                      ? 'text-slate-500 line-through'
                      : state === 'header'
                        ? 'text-slate-100 font-semibold'
                        : 'text-text'
                  }
                >
                  {lineText(line)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {headerIndex >= 0 && (
          <>
            <ChipPicker label="Item name column" headings={headings} value={nameColumn} onChange={setNameColumn} />
            <ChipPicker label="Quantity column" headings={headings} value={quantityColumn} onChange={setQuantityColumn} />
            <ChipPicker
              label="Category (optional)"
              headings={headings}
              value={categoryColumn}
              onChange={(v) => {
                setCategoryColumn(v);
                setCategoryFrom(v >= 0 ? 'column' : 'none');
              }}
              extra={{
                label: 'Section headings',
                selected: categoryFrom === 'heading',
                onPress: () => {
                  setCategoryColumn(-1);
                  setCategoryFrom(categoryFrom === 'heading' ? 'none' : 'heading');
                },
              }}
              optional
            />
            <ChipPicker label="Item code (optional)" headings={headings} value={codeColumn} onChange={setCodeColumn} optional />

            <Text className="text-text text-xs mb-1.5 mt-1">Layout name</Text>
            <TextInput
              className="bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 mb-5"
              style={{ fontSize: 14 }}
              value={name}
              onChangeText={setName}
              maxLength={80}
              accessibilityLabel="Layout name"
            />
          </>
        )}

        {preview && (
          <View accessibilityLiveRegion="polite">
            <Text className={`text-sm mb-2 ${preview.drift ? 'text-warning' : 'text-slate-100'}`} testID="teach-count">
              {preview.rows.length} item{preview.rows.length === 1 ? '' : 's'} found on the first pages
              {preview.drift && preview.rows.length > 0 ? '. Some lines with a quantity could not be read; check the columns.' : ''}
            </Text>
            {preview.rows.slice(0, PREVIEW_ROWS).map((r: { name: string; quantity: number; category: string }, i: number) => (
              <View key={i} className="flex-row justify-between py-1.5 border-b border-white/5">
                <Text className="text-slate-100 text-xs flex-1 mr-2" numberOfLines={1}>
                  {r.name}
                  {r.category ? <Text className="text-text">{`  ${r.category}`}</Text> : null}
                </Text>
                <Text className="text-slate-100 text-xs">×{r.quantity}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3 bg-background border-t border-white/10">
        <TouchableOpacity
          onPress={save}
          disabled={!canSave}
          className={`rounded-xl py-3.5 items-center ${canSave ? 'bg-accent' : 'bg-accent/40'}`}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Save layout"
        >
          {saving ? (
            <ActivityIndicator color="#0f1117" size="small" />
          ) : (
            <Text className="text-background font-semibold text-base">Save layout</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

interface ChipPickerProps {
  label: string;
  headings: { label: string }[];
  value: number;
  onChange: (index: number) => void;
  optional?: boolean;
  extra?: { label: string; selected: boolean; onPress: () => void };
}

function ChipPicker({ label, headings, value, onChange, optional = false, extra }: ChipPickerProps) {
  return (
    <View className="mb-4">
      <Text className="text-text text-xs mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
        {optional && (
          <Chip label="None" selected={value < 0 && !extra?.selected} onPress={() => onChange(-1)} />
        )}
        {headings.map((h, i) => (
          <Chip key={i} label={h.label} selected={value === i} onPress={() => onChange(i)} />
        ))}
        {extra && <Chip label={extra.label} selected={extra.selected} onPress={extra.onPress} />}
      </View>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={`px-3 py-1.5 rounded-full border ${selected ? 'border-accent bg-accent/15' : 'border-white/15'}`}
      activeOpacity={0.7}
    >
      <Text className={`text-xs ${selected ? 'text-slate-100' : 'text-text'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
