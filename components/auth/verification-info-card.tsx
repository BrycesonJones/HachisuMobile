import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

export interface VerificationInfoRow {
  icon: keyof typeof MaterialIcons.glyphMap;
  text: string;
}

interface VerificationInfoCardProps {
  rows: VerificationInfoRow[];
}

function InfoRow({ icon, text }: VerificationInfoRow) {
  return (
    <View style={styles.row}>
      <View style={styles.iconContainer}>
        <MaterialIcons name={icon} size={22} color={COLORS.primaryText} />
      </View>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

export function VerificationInfoCard({ rows }: VerificationInfoCardProps) {
  return (
    <View style={styles.infoCard}>
      {rows.map((row, index) => (
        <View key={row.text}>
          <InfoRow icon={row.icon} text={row.text} />
          {index < rows.length - 1 && <View style={styles.divider} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: 'hidden',
    marginBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginHorizontal: 20,
  },
});
