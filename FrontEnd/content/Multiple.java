import javax.swing.*;
import java.awt.*;
import java.util.HashMap;

public class ChessBoardUI extends JFrame {

    private final int TILE_SIZE = 70;
    private final int BOARD_SIZE = 8;

    JLayeredPane layeredPane;
    JPanel boardLayer;
    JPanel highlightLayer;
    JPanel pieceLayer;

    HashMap<String, String> pieces = new HashMap<>();

    public ChessBoardUI() {
        setTitle("Multi-Layer Chess Board");
        setSize(600, 600);
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setLocationRelativeTo(null);

        layeredPane = new JLayeredPane();
        layeredPane.setPreferredSize(new Dimension(TILE_SIZE * BOARD_SIZE, TILE_SIZE * BOARD_SIZE));
        add(layeredPane);

        createBoardLayer();
        createHighlightLayer();
        createPiecesLayer();

        setVisible(true);
    }

    // ------------------ BOARD LAYER -----------------------
    private void createBoardLayer() {
        boardLayer = new JPanel();
        boardLayer.setLayout(new GridLayout(8, 8));
        boardLayer.setBounds(0, 0, TILE_SIZE * BOARD_SIZE, TILE_SIZE * BOARD_SIZE);

        for (int r = 0; r < BOARD_SIZE; r++) {
            for (int c = 0; c < BOARD_SIZE; c++) {

                JPanel tile = new JPanel();
                boolean isDark = (r + c) % 2 == 1;

                tile.setBackground(isDark ? Color.GRAY : Color.WHITE);
                tile.setBorder(BorderFactory.createLineBorder(Color.BLACK));
                boardLayer.add(tile);
            }
        }

        layeredPane.add(boardLayer, Integer.valueOf(0)); // Base Layer
    }

    // ------------------ HIGHLIGHT LAYER -----------------------
    private void createHighlightLayer() {
        highlightLayer = new JPanel();
        highlightLayer.setLayout(new GridLayout(8, 8));
        highlightLayer.setOpaque(false);
        highlightLayer.setBounds(0, 0, TILE_SIZE * BOARD_SIZE, TILE_SIZE * BOARD_SIZE);

        for (int r = 0; r < BOARD_SIZE; r++) {
            for (int c = 0; c < BOARD_SIZE; c++) {

                JPanel highlight = new JPanel();
                highlight.setOpaque(false);

                String id = r + "-" + c;

                // Example highlighted squares
                if (id.equals("6-4") || id.equals("4-4") || id.equals("2-4")) {
                    highlight.setBackground(new Color(255, 255, 0, 120));
                    highlight.setOpaque(true);
                }

                highlightLayer.add(highlight);
            }
        }

        layeredPane.add(highlightLayer, Integer.valueOf(1)); // Middle Layer
    }

    // ------------------ PIECE LAYER -----------------------
    private void createPiecesLayer() {

        // sample pieces
        pieces.put("0-0", "♜");
        pieces.put("0-7", "♜");
        pieces.put("7-0", "♖");
        pieces.put("7-7", "♖");
        pieces.put("6-4", "♙");

        pieceLayer = new JPanel();
        pieceLayer.setLayout(new GridLayout(8, 8));
        pieceLayer.setOpaque(false);
        pieceLayer.setBounds(0, 0, TILE_SIZE * BOARD_SIZE, TILE_SIZE * BOARD_SIZE);

        for (int r = 0; r < BOARD_SIZE; r++) {
            for (int c = 0; c < BOARD_SIZE; c++) {
                JPanel square = new JPanel();
                square.setOpaque(false);

                String key = r + "-" + c;

                if (pieces.containsKey(key)) {
                    JLabel pieceLabel = new JLabel(pieces.get(key));
                    pieceLabel.setFont(new Font("Serif", Font.BOLD, 40));
                    square.add(pieceLabel);
                }

                pieceLayer.add(square);
            }
        }

        layeredPane.add(pieceLayer, Integer.valueOf(2)); // Top Layer
    }

    public static void main(String[] args) {
        new ChessBoardUI();
    }
}
